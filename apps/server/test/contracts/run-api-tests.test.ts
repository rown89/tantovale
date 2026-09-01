import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { runChildProcess, type ProcessRunnerRuntime } from '../../scripts/run-api-tests';

const tsxLoaderPath = createRequire(import.meta.url).resolve('tsx');
const fixturePath = fileURLToPath(new URL('../fixtures/run-child-process.ts', import.meta.url));

type ProcessResult = { code: number | null; signal: NodeJS.Signals | null };

function waitWithTimeout<T>(promise: Promise<T>, message: string, timeoutMs = 5_000): Promise<T> {
	let timeout: NodeJS.Timeout | undefined;
	const timeoutPromise = new Promise<never>((_, reject) => {
		timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
	});

	return Promise.race([promise, timeoutPromise]).finally(() => {
		if (timeout !== undefined) clearTimeout(timeout);
	});
}

async function terminateFixtureTree(fixture: ChildProcess, output: string): Promise<void> {
	if (process.platform !== 'win32') {
		const nestedProcessId = /TREE_CHILD_PID:(\d+)/.exec(output)?.[1];
		const processGroups = [
			nestedProcessId === undefined ? undefined : Number(nestedProcessId),
			fixture.exitCode === null && fixture.signalCode === null ? fixture.pid : undefined,
		];
		for (const processGroup of processGroups) {
			if (processGroup === undefined || !isProcessAlive(processGroup)) continue;
			try {
				process.kill(-processGroup, 'SIGKILL');
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
			}
		}
		return;
	}
	if (fixture.pid === undefined || fixture.exitCode !== null || fixture.signalCode !== null) return;

	await new Promise<void>((resolve, reject) => {
		const taskkill = spawn('taskkill', ['/PID', String(fixture.pid), '/T', '/F'], {
			stdio: 'ignore',
		});
		taskkill.once('error', reject);
		taskkill.once('close', () => resolve());
	});
}

function startFixture(mode: string, ...args: string[]) {
	const fixture = spawn(process.execPath, ['--import', tsxLoaderPath, fixturePath, mode, ...args], {
		detached: process.platform !== 'win32',
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	let output = '';
	let closeResult: ProcessResult | undefined;
	const outputEvents = new EventEmitter();
	const close = new Promise<ProcessResult>((resolve, reject) => {
		fixture.once('error', reject);
		fixture.once('close', (code, signal) => {
			closeResult = { code, signal };
			resolve(closeResult);
		});
	});
	const appendOutput = (chunk: Buffer | string) => {
		output += chunk.toString();
		outputEvents.emit('output');
	};
	fixture.stdout.on('data', appendOutput);
	fixture.stderr.on('data', appendOutput);

	const waitForOutput = async (needle: string) => {
		if (output.includes(needle)) return;

		await waitWithTimeout(
			new Promise<void>((resolve, reject) => {
				const inspectOutput = () => {
					if (!output.includes(needle)) return;
					outputEvents.off('output', inspectOutput);
					resolve();
				};
				outputEvents.on('output', inspectOutput);
				void close.then(({ code, signal }) => {
					outputEvents.off('output', inspectOutput);
					reject(new Error(`Fixture closed before ${needle}: code=${String(code)}, signal=${String(signal)}`));
				}, reject);
			}),
			`Fixture did not emit ${needle}`,
		);
	};

	const ensureStopped = async () => {
		await terminateFixtureTree(fixture, output);
		await waitWithTimeout(close, 'Fixture did not close during cleanup');
	};

	return { close, ensureStopped, fixture, getOutput: () => output, waitForOutput };
}

async function runFixture(mode: string): Promise<ProcessResult & { output: string }> {
	const running = startFixture(mode);
	try {
		const result = await waitWithTimeout(running.close, `Fixture ${mode} did not close`);
		return { ...result, output: running.getOutput() };
	} finally {
		await running.ensureStopped();
	}
}

function readProcessId(output: string, marker: string): number {
	const match = new RegExp(`${marker}:(\\d+)`).exec(output);
	if (match === null) throw new Error(`Missing ${marker} in fixture output`);
	return Number(match[1]);
}

function isProcessAlive(processId: number): boolean {
	try {
		process.kill(processId, 0);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
		throw error;
	}
}

async function expectFixtureTreeGone(output: string): Promise<void> {
	const processIds = [readProcessId(output, 'TREE_CHILD_PID'), readProcessId(output, 'DESCENDANT_PID')];
	await waitWithTimeout(
		(async () => {
			while (processIds.some(isProcessAlive)) await new Promise<void>((resolve) => setImmediate(resolve));
		})(),
		'Fixture descendants remained alive after wrapper shutdown',
	);
}

function createFakeChild(processId: number): ChildProcess {
	const child = new EventEmitter() as ChildProcess;
	Object.defineProperties(child, {
		exitCode: { configurable: true, value: null, writable: true },
		pid: { configurable: true, value: processId },
		signalCode: { configurable: true, value: null, writable: true },
	});
	return child;
}

function createRuntimeWithListeners(
	child: ChildProcess,
	overrides: Partial<ProcessRunnerRuntime> = {},
): { listeners: Map<NodeJS.Signals, () => void>; runtime: ProcessRunnerRuntime } {
	const listeners = new Map<NodeJS.Signals, () => void>();
	return {
		listeners,
		runtime: {
			addSignalListener: (signal, listener) => listeners.set(signal, listener),
			platform: 'linux',
			removeSignalListener: (signal, listener) => {
				if (listeners.get(signal) === listener) listeners.delete(signal);
			},
			signalProcess: (processId, signal) => process.kill(processId, signal),
			signalSelf: (signal) => process.kill(process.pid, signal),
			spawnChild: () => child,
			...overrides,
		},
	};
}

async function waitForSpawn(child: ChildProcess): Promise<void> {
	if (child.pid === undefined) return;
	await new Promise<void>((resolve, reject) => {
		child.once('spawn', resolve);
		child.once('error', reject);
	});
}

async function cleanupActualChild(child: ChildProcess | undefined): Promise<void> {
	if (child?.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
	const close = new Promise<void>((resolve) => child.once('close', () => resolve()));
	try {
		process.kill(-child.pid, 'SIGKILL');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
	}
	await waitWithTimeout(close, 'Actual child did not close during cleanup');
}

describe('API test process runner', () => {
	it('preserves successful and nonzero child exit codes without synchronous fixtures', async () => {
		await expect(runFixture('success')).resolves.toMatchObject({ signal: null, code: 0 });
		await expect(runFixture('failure')).resolves.toMatchObject({ signal: null, code: 7 });
	});

	it.runIf(process.platform !== 'win32')('propagates a child termination signal to its caller', async () => {
		await expect(runFixture('signal')).resolves.toMatchObject({ signal: 'SIGTERM', code: null });
	});

	it.runIf(process.platform !== 'win32').each(['SIGINT', 'SIGTERM'] as const)(
		'forwards one %s from the isolated wrapper group exactly once and tears down descendants',
		async (signal) => {
			const running = startFixture('process-tree', signal, '1');

			try {
				await running.waitForOutput('TREE:READY');
				process.kill(-running.fixture.pid!, signal);
				const closeResult = await waitWithTimeout(running.close, 'Wrapper process group did not terminate');
				const output = running.getOutput();

				expect(closeResult).toEqual({ code: null, signal });
				expect(output).toContain('CHILD:COUNT:1');
				expect(output).toContain('DESCENDANT:COUNT:1');
				expect(output).toContain('DESCENDANT:CLOSED');
				expect(output).not.toContain('COUNT:2');
				await expectFixtureTreeGone(output);
			} finally {
				await running.ensureStopped();
			}
		},
	);

	it.runIf(process.platform !== 'win32')(
		'forwards a deliberate second signal event so a hung graceful shutdown can be forced',
		async () => {
			const running = startFixture('process-tree', 'SIGTERM', '2');

			try {
				await running.waitForOutput('TREE:READY');
				process.kill(-running.fixture.pid!, 'SIGTERM');
				await running.waitForOutput('DESCENDANT:COUNT:1');
				expect(running.getOutput()).toContain('CHILD:COUNT:1');
				expect(running.fixture.exitCode).toBeNull();

				process.kill(-running.fixture.pid!, 'SIGTERM');
				const closeResult = await waitWithTimeout(running.close, 'Wrapper ignored the second termination event');
				const output = running.getOutput();

				expect(closeResult).toEqual({ code: null, signal: 'SIGTERM' });
				expect(output).toContain('CHILD:COUNT:2');
				expect(output).toContain('DESCENDANT:COUNT:2');
				expect(output).not.toContain('COUNT:3');
				await expectFixtureTreeGone(output);
			} finally {
				await running.ensureStopped();
			}
		},
	);

	it('queues every pre-spawn POSIX signal event in order and forwards each exactly once', async () => {
		const child = createFakeChild(71);
		const forwarded: Array<[number, NodeJS.Signals]> = [];
		const selfSignals: NodeJS.Signals[] = [];
		const { listeners, runtime } = createRuntimeWithListeners(child, {
			signalProcess: (processId, signal) => forwarded.push([processId, signal]),
			signalSelf: (signal) => selfSignals.push(signal),
			spawnChild: (_command, _args, options) => {
				expect(options).toEqual({ detached: true, stdio: 'inherit' });
				listeners.get('SIGTERM')?.();
				listeners.get('SIGINT')?.();
				listeners.get('SIGTERM')?.();
				queueMicrotask(() => child.emit('close', 0, null));
				return child;
			},
		});

		await expect(runChildProcess(process.execPath, [], runtime)).resolves.toBeUndefined();
		expect(forwarded).toEqual([
			[-71, 'SIGTERM'],
			[-71, 'SIGINT'],
			[-71, 'SIGTERM'],
		]);
		expect(selfSignals).toEqual(['SIGTERM']);
		expect(listeners).toEqual(new Map());
	});

	it('uses non-intercepting shared-console signal ownership on Windows', async () => {
		const child = createFakeChild(72);
		let listenerRegistrations = 0;
		const detachedOptions: boolean[] = [];
		const { listeners, runtime } = createRuntimeWithListeners(child, {
			addSignalListener: () => {
				listenerRegistrations += 1;
			},
			platform: 'win32',
			spawnChild: (_command, _args, options) => {
				detachedOptions.push(options.detached);
				queueMicrotask(() => child.emit('close', 0, null));
				return child;
			},
		});

		await expect(runChildProcess(process.execPath, [], runtime)).resolves.toBe(0);
		expect(listenerRegistrations).toBe(0);
		expect(detachedOptions).toEqual([false]);
		expect(listeners).toEqual(new Map());
	});

	it('falls back from a failed POSIX group signal to the direct child and leaves no orphan', async () => {
		let child: ChildProcess | undefined;
		const attempts: Array<[number, NodeJS.Signals]> = [];
		const selfSignals: NodeJS.Signals[] = [];
		const listeners = new Map<NodeJS.Signals, () => void>();
		const runner = runChildProcess(process.execPath, ['--eval', 'setInterval(() => {}, 1_000)'], {
			addSignalListener: (signal, listener) => listeners.set(signal, listener),
			platform: 'linux',
			removeSignalListener: (signal, listener) => {
				if (listeners.get(signal) === listener) listeners.delete(signal);
			},
			signalProcess: (processId, signal) => {
				attempts.push([processId, signal]);
				if (processId < 0) throw Object.assign(new Error('test-local group denial'), { code: 'EPERM' });
				process.kill(processId, signal);
			},
			signalSelf: (signal) => selfSignals.push(signal),
			spawnChild: (command, args, options) => {
				child = spawn(command, args, options);
				return child;
			},
		});

		try {
			await waitForSpawn(child!);
			listeners.get('SIGTERM')?.();
			await expect(waitWithTimeout(runner, 'Fallback runner did not settle')).resolves.toBeUndefined();
			expect(attempts).toEqual([
				[-child!.pid!, 'SIGTERM'],
				[child!.pid!, 'SIGTERM'],
			]);
			expect(selfSignals).toEqual(['SIGTERM']);
			expect(isProcessAlive(child!.pid!)).toBe(false);
			expect(listeners).toEqual(new Map());
		} finally {
			await cleanupActualChild(child);
		}
	});

	it('force-kills and awaits a detached child before reporting failed graceful delivery', async () => {
		let child: ChildProcess | undefined;
		const attempts: Array<[number, NodeJS.Signals]> = [];
		const listeners = new Map<NodeJS.Signals, () => void>();
		const deliveryError = Object.assign(new Error('test-local delivery denial'), { code: 'EPERM' });
		const runner = runChildProcess(process.execPath, ['--eval', 'setInterval(() => {}, 1_000)'], {
			addSignalListener: (signal, listener) => listeners.set(signal, listener),
			platform: 'linux',
			removeSignalListener: (signal, listener) => {
				if (listeners.get(signal) === listener) listeners.delete(signal);
			},
			signalProcess: (processId, signal) => {
				attempts.push([processId, signal]);
				if (signal !== 'SIGKILL' || processId < 0) throw deliveryError;
				process.kill(processId, signal);
			},
			signalSelf: () => undefined,
			spawnChild: (command, args, options) => {
				child = spawn(command, args, options);
				return child;
			},
		});

		try {
			await waitForSpawn(child!);
			listeners.get('SIGTERM')?.();
			await expect(waitWithTimeout(runner, 'Forced-cleanup runner did not settle')).rejects.toBe(deliveryError);
			expect(attempts).toEqual([
				[-child!.pid!, 'SIGTERM'],
				[child!.pid!, 'SIGTERM'],
				[-child!.pid!, 'SIGKILL'],
				[child!.pid!, 'SIGKILL'],
			]);
			expect(isProcessAlive(child!.pid!)).toBe(false);
			expect(listeners).toEqual(new Map());
		} finally {
			await cleanupActualChild(child);
		}
	});

	it('removes wrapper listeners when spawning fails', async () => {
		const before = {
			interrupt: process.listenerCount('SIGINT'),
			termination: process.listenerCount('SIGTERM'),
		};

		await expect(runChildProcess('/definitely/not/a/tantovale-executable', [])).rejects.toMatchObject({
			code: 'ENOENT',
		});
		expect(process.listenerCount('SIGINT')).toBe(before.interrupt);
		expect(process.listenerCount('SIGTERM')).toBe(before.termination);
	});
});
