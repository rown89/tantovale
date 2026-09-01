import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function normalizeForwardedVitestArguments(args: string[]): string[] {
	return args.filter((argument) => argument !== '--');
}

export type ForwardedSignal = 'SIGINT' | 'SIGTERM';

// pnpm can proxy the same terminal signal after the kernel has already delivered it
// to the lifecycle process group. The observed duplicate was <=0.276ms; 10ms keeps
// a bounded scheduler margin without swallowing a deliberate rapid escalation.
export const SIGNAL_BURST_COALESCE_WINDOW_MS = 10;

export type SignalBurstMode = 'direct' | 'pnpm-lifecycle';

export type ObservedSignalEvent = {
	observedAt: number;
	signal: ForwardedSignal;
};

export function shouldForwardSignalEvent(
	mode: SignalBurstMode,
	lastForwarded: ObservedSignalEvent | null,
	current: ObservedSignalEvent,
	windowMs = SIGNAL_BURST_COALESCE_WINDOW_MS,
): boolean {
	if (mode === 'direct') return true;
	if (lastForwarded === null || lastForwarded.signal !== current.signal) return true;
	const elapsed = current.observedAt - lastForwarded.observedAt;
	return elapsed < 0 || elapsed >= windowMs;
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
	monotonicNow?: () => number;
	platform: NodeJS.Platform;
	removeSignalListener: (signal: ForwardedSignal, listener: () => void) => void;
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
	monotonicNow: () => performance.now(),
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
	options: RunChildProcessOptions = {},
): Promise<number | undefined> {
	return new Promise<number | undefined>((resolve, reject) => {
		const signalPolicy = resolveProcessSignalPolicy(runtime.platform);
		let child: ManagedChildProcess | undefined;
		const pendingSignals: ObservedSignalEvent[] = [];
		let firstReceivedSignal: ForwardedSignal | null = null;
		let lastForwardedSignal: ObservedSignalEvent | null = null;
		let flushingSignals = false;
		let forcedCleanupError: unknown;
		let forcedCleanupStarted = false;
		let settled = false;

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
		const deliverSignal = (event: ObservedSignalEvent) => {
			if (child?.pid === undefined) return;
			if (!shouldForwardSignalEvent(options.signalBurstMode ?? 'direct', lastForwardedSignal, event)) return;
			lastForwardedSignal = event;

			try {
				runtime.signalProcess(-child.pid, event.signal);
			} catch (groupError) {
				if (isNoSuchProcessError(groupError)) return;

				try {
					runtime.signalProcess(child.pid, event.signal);
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
			pendingSignals.push({ observedAt: runtime.monotonicNow?.() ?? performance.now(), signal });
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
