import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function normalizeForwardedVitestArguments(args: string[]): string[] {
	return args.filter((argument) => argument !== '--');
}

function isDirectExecution(): boolean {
	const entrypoint = process.argv[1];
	return entrypoint !== undefined && pathToFileURL(path.resolve(entrypoint)).href === import.meta.url;
}

if (isDirectExecution()) {
	const vitestEntrypoint = fileURLToPath(import.meta.resolve('vitest/vitest.mjs'));
	const result = spawnSync(
		process.execPath,
		[
			vitestEntrypoint,
			'run',
			'--config',
			'vitest.config.ts',
			...normalizeForwardedVitestArguments(process.argv.slice(2)),
		],
		{ stdio: 'inherit' },
	);

	if (result.error) throw result.error;
	process.exitCode = result.status ?? 1;
}
