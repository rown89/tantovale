import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { runChildProcess } from '../../scripts/run-api-tests';

const tsxLoaderPath = createRequire(import.meta.url).resolve('tsx');
const fixturePath = fileURLToPath(new URL('../fixtures/run-child-process.ts', import.meta.url));

function runFixture(mode: string) {
	return spawnSync(process.execPath, ['--import', tsxLoaderPath, fixturePath, mode], {
		encoding: 'utf8',
		timeout: 5_000,
	});
}

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

function startDetachedFixture(signal: 'SIGINT' | 'SIGTERM') {
	const fixture = spawn(process.execPath, ['--import', tsxLoaderPath, fixturePath, 'process-tree', signal], {
		detached: true,
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	let output = '';
	const outputEvents = new EventEmitter();
	const close = new Promise<ProcessResult>((resolve, reject) => {
		fixture.once('error', reject);
		fixture.once('close', (code, closeSignal) => resolve({ code, signal: closeSignal }));
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
				void close.then(({ code, signal: closeSignal }) => {
					outputEvents.off('output', inspectOutput);
					reject(new Error(`Fixture closed before ${needle}: code=${String(code)}, signal=${String(closeSignal)}`));
				}, reject);
			}),
			`Fixture did not emit ${needle}`,
		);
	};

	return { close, fixture, getOutput: () => output, waitForOutput };
}

function killProcessGroup(processId: number | undefined): void {
	if (processId === undefined || !Number.isSafeInteger(processId) || processId <= 1) return;
	try {
		process.kill(-processId, 'SIGKILL');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
	}
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

describe('API test process runner', () => {
	it('preserves successful and nonzero child exit codes', () => {
		expect(runFixture('success')).toMatchObject({ signal: null, status: 0 });
		expect(runFixture('failure')).toMatchObject({ signal: null, status: 7 });
	});

	it.runIf(process.platform !== 'win32')('propagates a child termination signal to its caller', () => {
		expect(runFixture('signal')).toMatchObject({ signal: 'SIGTERM', status: null });
	});

	it.runIf(process.platform !== 'win32').each(['SIGINT', 'SIGTERM'] as const)(
		'forwards one %s from the isolated wrapper group to the child group and tears down descendants',
		async (signal) => {
			const running = startDetachedFixture(signal);
			let treeChildProcessId: number | undefined;
			let closeResult: ProcessResult | undefined;

			try {
				await running.waitForOutput('TREE:READY');
				const processIdMatch = /TREE_CHILD_PID:(\d+)/.exec(running.getOutput());
				treeChildProcessId = processIdMatch === null ? undefined : Number(processIdMatch[1]);
				expect(treeChildProcessId).toBeGreaterThan(1);
				expect(running.fixture.pid).toBeGreaterThan(1);

				process.kill(-running.fixture.pid!, signal);
				closeResult = await waitWithTimeout(running.close, 'Wrapper process group did not terminate');
				const output = running.getOutput();

				expect(closeResult).toEqual({ code: null, signal });
				expect(output).toContain('CHILD:COUNT:1');
				expect(output).toContain('DESCENDANT:COUNT:1');
				expect(output).toContain('DESCENDANT:CLOSED');
				expect(output).not.toContain('COUNT:2');
			} finally {
				if (closeResult === undefined) {
					const capturedChildProcessId = /TREE_CHILD_PID:(\d+)/.exec(running.getOutput());
					killProcessGroup(
						treeChildProcessId ?? (capturedChildProcessId === null ? undefined : Number(capturedChildProcessId[1])),
					);
					killProcessGroup(running.fixture.pid);
				}
				await waitWithTimeout(running.close, 'Wrapper process did not close during cleanup').catch(() => undefined);
			}
		},
	);

	it.each([
		{ childProcessId: 71, expectedTarget: -71, platform: 'linux' as const },
		{ childProcessId: 72, expectedTarget: 72, platform: 'win32' as const },
	])('captures a pending signal and forwards it once using the $platform strategy', async (testCase) => {
		const listeners = new Map<NodeJS.Signals, () => void>();
		const child = createFakeChild(testCase.childProcessId);
		const forwarded: Array<[number, NodeJS.Signals]> = [];
		const selfSignals: NodeJS.Signals[] = [];
		const detachedOptions: boolean[] = [];

		const result = runChildProcess(process.execPath, ['--eval', 'process.exit(0)'], {
			addSignalListener: (signal, listener) => listeners.set(signal, listener),
			platform: testCase.platform,
			removeSignalListener: (signal, listener) => {
				if (listeners.get(signal) === listener) listeners.delete(signal);
			},
			signalProcess: (processId, signal) => forwarded.push([processId, signal]),
			signalSelf: (signal) => selfSignals.push(signal),
			spawnChild: (_command, _args, options) => {
				detachedOptions.push(options.detached);
				listeners.get('SIGTERM')?.();
				listeners.get('SIGTERM')?.();
				queueMicrotask(() => child.emit('close', 0, null));
				return child;
			},
		});

		await expect(result).resolves.toBeUndefined();
		expect(forwarded).toEqual([[testCase.expectedTarget, 'SIGTERM']]);
		expect(selfSignals).toEqual(['SIGTERM']);
		expect(detachedOptions).toEqual([testCase.platform !== 'win32']);
		expect(listeners).toEqual(new Map());
	});

	it.each([
		{ code: 'ESRCH', rejects: false },
		{ code: 'EPERM', rejects: true },
	])('only ignores the expected $code process-group race', async ({ code, rejects }) => {
		const listeners = new Map<NodeJS.Signals, () => void>();
		const child = createFakeChild(73);
		const selfSignals: NodeJS.Signals[] = [];
		const runner = runChildProcess(process.execPath, ['--eval', 'process.exit(0)'], {
			addSignalListener: (signal, listener) => listeners.set(signal, listener),
			platform: 'linux',
			removeSignalListener: (signal, listener) => {
				if (listeners.get(signal) === listener) listeners.delete(signal);
			},
			signalProcess: () => {
				throw Object.assign(new Error('test-local signal failure'), { code });
			},
			signalSelf: (signal) => selfSignals.push(signal),
			spawnChild: () => {
				listeners.get('SIGTERM')?.();
				queueMicrotask(() => child.emit('close', 0, null));
				return child;
			},
		});

		if (rejects) {
			await expect(runner).rejects.toMatchObject({ code: 'EPERM' });
			expect(selfSignals).toEqual([]);
		} else {
			await expect(runner).resolves.toBeUndefined();
			expect(selfSignals).toEqual(['SIGTERM']);
		}
		expect(listeners).toEqual(new Map());
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
