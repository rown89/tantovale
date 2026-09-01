import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function normalizeForwardedVitestArguments(args: string[]): string[] {
	return args.filter((argument) => argument !== '--');
}

type ForwardedSignal = 'SIGINT' | 'SIGTERM';

type ManagedChildProcess = Pick<ChildProcess, 'exitCode' | 'pid' | 'signalCode'> & {
	once(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): ManagedChildProcess;
	once(event: 'error', listener: (error: Error) => void): ManagedChildProcess;
};

type ChildSpawnOptions = {
	detached: boolean;
	stdio: 'inherit';
};

export type ProcessRunnerRuntime = {
	addSignalListener: (signal: ForwardedSignal, listener: () => void) => void;
	platform: NodeJS.Platform;
	removeSignalListener: (signal: ForwardedSignal, listener: () => void) => void;
	signalProcess: (processId: number, signal: ForwardedSignal) => void;
	signalSelf: (signal: NodeJS.Signals) => void;
	spawnChild: (command: string, args: string[], options: ChildSpawnOptions) => ManagedChildProcess;
};

const processRunnerRuntime: ProcessRunnerRuntime = {
	addSignalListener: (signal, listener) => process.on(signal, listener),
	platform: process.platform,
	removeSignalListener: (signal, listener) => process.off(signal, listener),
	signalProcess: (processId, signal) => process.kill(processId, signal),
	signalSelf: (signal) => process.kill(process.pid, signal),
	spawnChild: (command, args, options) => spawn(command, args, options),
};

function isNoSuchProcessError(error: unknown): boolean {
	return error instanceof Error && (error as NodeJS.ErrnoException).code === 'ESRCH';
}

export async function runChildProcess(
	command: string,
	args: string[],
	runtime: ProcessRunnerRuntime = processRunnerRuntime,
): Promise<number | undefined> {
	return new Promise<number | undefined>((resolve, reject) => {
		let child: ManagedChildProcess | undefined;
		let forwardedSignal = false;
		let receivedSignal: ForwardedSignal | null = null;
		let settled = false;

		const cleanup = () => {
			runtime.removeSignalListener('SIGINT', forwardInterrupt);
			runtime.removeSignalListener('SIGTERM', forwardTermination);
		};
		const fail = (error: unknown) => {
			if (settled) return;
			settled = true;
			cleanup();
			reject(error);
		};
		const forwardPendingSignal = () => {
			if (
				forwardedSignal ||
				receivedSignal === null ||
				child?.pid === undefined ||
				child.exitCode !== null ||
				child.signalCode !== null
			) {
				return;
			}

			forwardedSignal = true;
			const childTarget = runtime.platform === 'win32' ? child.pid : -child.pid;
			try {
				runtime.signalProcess(childTarget, receivedSignal);
			} catch (error) {
				if (!isNoSuchProcessError(error)) fail(error);
			}
		};
		const receiveSignal = (signal: ForwardedSignal) => {
			receivedSignal ??= signal;
			forwardPendingSignal();
		};
		const forwardInterrupt = () => receiveSignal('SIGINT');
		const forwardTermination = () => receiveSignal('SIGTERM');

		// Install before spawn so a parent cancellation cannot land in a listener gap.
		runtime.addSignalListener('SIGINT', forwardInterrupt);
		runtime.addSignalListener('SIGTERM', forwardTermination);

		try {
			child = runtime.spawnChild(command, args, {
				detached: runtime.platform !== 'win32',
				stdio: 'inherit',
			});
		} catch (error) {
			fail(error);
			return;
		}

		child.once('error', fail);
		child.once('close', (code, signal) => {
			if (settled) return;
			settled = true;
			cleanup();

			const terminatingSignal = signal ?? receivedSignal;
			if (terminatingSignal !== null) {
				runtime.signalSelf(terminatingSignal);
				resolve(undefined);
				return;
			}

			resolve(code ?? 1);
		});

		forwardPendingSignal();
	});
}

function isDirectExecution(): boolean {
	const entrypoint = process.argv[1];
	return entrypoint !== undefined && pathToFileURL(path.resolve(entrypoint)).href === import.meta.url;
}

if (isDirectExecution()) {
	const vitestEntrypoint = fileURLToPath(import.meta.resolve('vitest/vitest.mjs'));
	process.exitCode = await runChildProcess(process.execPath, [
		vitestEntrypoint,
		'run',
		'--config',
		'vitest.config.ts',
		...normalizeForwardedVitestArguments(process.argv.slice(2)),
	]);
}
