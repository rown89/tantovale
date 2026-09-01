import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function normalizeForwardedVitestArguments(args: string[]): string[] {
	return args.filter((argument) => argument !== '--');
}

export type ForwardedSignal = 'SIGINT' | 'SIGTERM';

// A lifecycle group signal reaches this wrapper directly and can then be proxied by
// pnpm. Keeping the same-signal gate across two check-phase boundaries groups those
// deliveries even when the wrapper event loop is briefly blocked. Node does not
// expose a signal sender, so a repeated same-signal delivery inside that bounded
// burst is intentionally one cancellation; a different signal remains an immediate
// escalation. Direct callers never use this coalescing policy.
export const SIGNAL_BURST_COALESCE_TURNS = 2;

export type SignalBurstMode = 'direct' | 'pnpm-lifecycle';

export function createSignalBurstPolicy(
	mode: SignalBurstMode,
	scheduleTurn: (callback: () => void) => void,
): (signal: ForwardedSignal) => boolean {
	const burstGenerations = new Map<ForwardedSignal, number>();
	const guardedSignals = new Set<ForwardedSignal>();

	return (signal) => {
		if (mode === 'direct') return true;
		if (guardedSignals.has(signal)) return false;

		guardedSignals.add(signal);
		const generation = (burstGenerations.get(signal) ?? 0) + 1;
		burstGenerations.set(signal, generation);
		let remainingTurns = SIGNAL_BURST_COALESCE_TURNS;
		const advanceTurn = () => {
			scheduleTurn(() => {
				if (generation !== burstGenerations.get(signal)) return;
				remainingTurns -= 1;
				if (remainingTurns === 0) guardedSignals.delete(signal);
				else advanceTurn();
			});
		};
		advanceTurn();
		return true;
	};
}

export function resolveSignalBurstMode(environment: Readonly<Record<string, string | undefined>>): SignalBurstMode {
	return (environment['npm_lifecycle_event']?.length ?? 0) > 0 &&
		environment['npm_config_user_agent']?.startsWith('pnpm/') === true
		? 'pnpm-lifecycle'
		: 'direct';
}

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
	scheduleSignalBurstTurn?: (callback: () => void) => void;
	signalProcess: (processId: number, signal: NodeJS.Signals) => void;
	signalSelf: (signal: NodeJS.Signals) => void;
	spawnChild: (command: string, args: string[], options: ChildSpawnOptions) => ManagedChildProcess;
};

export type ProcessSignalPolicy = {
	detached: boolean;
	proxySignals: boolean;
};

export type RunChildProcessOptions = {
	signalBurstMode?: SignalBurstMode;
};

export function resolveProcessSignalPolicy(platform: NodeJS.Platform): ProcessSignalPolicy {
	return platform === 'win32' ? { detached: false, proxySignals: false } : { detached: true, proxySignals: true };
}

const processRunnerRuntime: ProcessRunnerRuntime = {
	addSignalListener: (signal, listener) => process.on(signal, listener),
	platform: process.platform,
	removeSignalListener: (signal, listener) => process.off(signal, listener),
	scheduleSignalBurstTurn: (callback) => setImmediate(callback),
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
	options: RunChildProcessOptions = {},
): Promise<number | undefined> {
	return new Promise<number | undefined>((resolve, reject) => {
		const signalPolicy = resolveProcessSignalPolicy(runtime.platform);
		let child: ManagedChildProcess | undefined;
		const pendingSignals: ForwardedSignal[] = [];
		let firstReceivedSignal: ForwardedSignal | null = null;
		let flushingSignals = false;
		let forcedCleanupError: unknown;
		let forcedCleanupStarted = false;
		let settled = false;
		const shouldForwardSignal = createSignalBurstPolicy(
			options.signalBurstMode ?? 'direct',
			runtime.scheduleSignalBurstTurn ?? ((callback) => setImmediate(callback)),
		);

		const cleanup = () => {
			if (!signalPolicy.proxySignals) return;
			runtime.removeSignalListener('SIGINT', forwardInterrupt);
			runtime.removeSignalListener('SIGTERM', forwardTermination);
		};
		const fail = (error: unknown) => {
			if (settled) return;
			settled = true;
			cleanup();
			reject(error);
		};
		const forceCleanup = (error: unknown) => {
			if (forcedCleanupStarted) return;
			forcedCleanupStarted = true;
			forcedCleanupError = error;
			cleanup();

			if (child?.pid === undefined) {
				fail(error);
				return;
			}

			// Both bounded attempts are intentional: killing the group tears down
			// descendants, while the direct fallback covers a missing/broken group.
			for (const processId of [-child.pid, child.pid]) {
				try {
					runtime.signalProcess(processId, 'SIGKILL');
				} catch (cleanupError) {
					if (!isNoSuchProcessError(cleanupError)) continue;
				}
			}
		};
		const deliverSignal = (signal: ForwardedSignal) => {
			if (child?.pid === undefined) return;
			if (!shouldForwardSignal(signal)) return;

			try {
				runtime.signalProcess(-child.pid, signal);
			} catch (groupError) {
				if (isNoSuchProcessError(groupError)) return;

				try {
					runtime.signalProcess(child.pid, signal);
				} catch (directError) {
					if (isNoSuchProcessError(directError)) return;
					forceCleanup(directError);
				}
			}
		};
		const forwardPendingSignals = () => {
			if (
				flushingSignals ||
				forcedCleanupStarted ||
				child?.pid === undefined ||
				child.exitCode !== null ||
				child.signalCode !== null
			) {
				return;
			}

			flushingSignals = true;
			try {
				while (pendingSignals.length > 0 && !forcedCleanupStarted) {
					deliverSignal(pendingSignals.shift()!);
				}
			} finally {
				flushingSignals = false;
			}
		};
		const receiveSignal = (signal: ForwardedSignal) => {
			firstReceivedSignal ??= signal;
			pendingSignals.push(signal);
			forwardPendingSignals();
		};
		const forwardInterrupt = () => receiveSignal('SIGINT');
		const forwardTermination = () => receiveSignal('SIGTERM');

		if (signalPolicy.proxySignals) {
			// Install before spawn so a parent cancellation cannot land in a listener gap.
			runtime.addSignalListener('SIGINT', forwardInterrupt);
			runtime.addSignalListener('SIGTERM', forwardTermination);
		}

		try {
			child = runtime.spawnChild(command, args, {
				detached: signalPolicy.detached,
				stdio: 'inherit',
			});
		} catch (error) {
			fail(error);
			return;
		}

		child.once('error', (error) => {
			if (child?.pid === undefined) fail(error);
			else forceCleanup(error);
		});
		child.once('close', (code, signal) => {
			if (settled) return;
			settled = true;
			cleanup();
			if (forcedCleanupError !== undefined) {
				reject(forcedCleanupError);
				return;
			}

			const terminatingSignal = signal ?? firstReceivedSignal;
			if (terminatingSignal !== null) {
				runtime.signalSelf(terminatingSignal);
				resolve(undefined);
				return;
			}

			resolve(code ?? 1);
		});

		forwardPendingSignals();
	});
}

function isDirectExecution(): boolean {
	const entrypoint = process.argv[1];
	return entrypoint !== undefined && pathToFileURL(path.resolve(entrypoint)).href === import.meta.url;
}

if (isDirectExecution()) {
	const vitestEntrypoint = fileURLToPath(import.meta.resolve('vitest/vitest.mjs'));
	process.exitCode = await runChildProcess(
		process.execPath,
		[
			vitestEntrypoint,
			'run',
			'--config',
			'vitest.config.ts',
			...normalizeForwardedVitestArguments(process.argv.slice(2)),
		],
		processRunnerRuntime,
		{ signalBurstMode: resolveSignalBurstMode(process.env) },
	);
}
