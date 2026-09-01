import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const tsxLoaderPath = createRequire(import.meta.url).resolve('tsx');
const fixturePath = fileURLToPath(new URL('../fixtures/run-child-process.ts', import.meta.url));

function runFixture(mode: string) {
	return spawnSync(process.execPath, ['--import', tsxLoaderPath, fixturePath, mode], {
		encoding: 'utf8',
		timeout: 5_000,
	});
}

describe('API test process runner', () => {
	it('preserves successful and nonzero child exit codes', () => {
		expect(runFixture('success')).toMatchObject({ signal: null, status: 0 });
		expect(runFixture('failure')).toMatchObject({ signal: null, status: 7 });
	});

	it.runIf(process.platform !== 'win32')('propagates a child termination signal to its caller', () => {
		expect(runFixture('signal')).toMatchObject({ signal: 'SIGTERM', status: null });
	});

	it.runIf(process.platform !== 'win32')(
		'forwards termination signals without touching the Vitest worker',
		async () => {
			const fixture = spawn(process.execPath, ['--import', tsxLoaderPath, fixturePath, 'forwarded-signal'], {
				stdio: ['ignore', 'pipe', 'pipe'],
			});

			await new Promise<void>((resolve, reject) => {
				const timeout = setTimeout(() => reject(new Error('Child process did not become ready')), 5_000);
				fixture.once('error', reject);
				fixture.stdout.setEncoding('utf8');
				fixture.stdout.on('data', (chunk: string) => {
					if (!chunk.includes('READY')) return;
					clearTimeout(timeout);
					resolve();
				});
			});

			fixture.kill('SIGTERM');
			const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
				fixture.once('error', reject);
				fixture.once('close', (code, signal) => resolve({ code, signal }));
			});

			expect(result).toEqual({ code: null, signal: 'SIGTERM' });
		},
	);
});
