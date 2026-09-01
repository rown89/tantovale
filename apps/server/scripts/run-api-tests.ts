import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function normalizeForwardedVitestArguments(args: string[]): string[] {
	return args.filter((argument) => argument !== '--');
}

export async function runChildProcess(command: string, args: string[]): Promise<number> {
	const child = spawn(command, args, { stdio: 'inherit' });

	return new Promise<number>((resolve, reject) => {
		let settled = false;
		let receivedSignal: NodeJS.Signals | null = null;
		const forwardSignal = (signal: NodeJS.Signals) => {
			if (child.exitCode === null && child.signalCode === null) {
				receivedSignal ??= signal;
				child.kill(signal);
			}
		};
		const forwardInterrupt = () => forwardSignal('SIGINT');
		const forwardTermination = () => forwardSignal('SIGTERM');
		const cleanup = () => {
			process.off('SIGINT', forwardInterrupt);
			process.off('SIGTERM', forwardTermination);
		};

		process.on('SIGINT', forwardInterrupt);
		process.on('SIGTERM', forwardTermination);

		child.once('error', (error) => {
			if (settled) return;
			settled = true;
			cleanup();
			reject(error);
		});

		child.once('close', (code, signal) => {
			if (settled) return;
			settled = true;
			cleanup();

			const terminatingSignal = signal ?? receivedSignal;
			if (terminatingSignal !== null) {
				process.kill(process.pid, terminatingSignal);
				return;
			}

			resolve(code ?? 1);
		});
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
