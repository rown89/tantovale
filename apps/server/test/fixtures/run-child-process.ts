import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { runChildProcess } from '../../scripts/run-api-tests';

const mode = process.argv[2];
const tsxLoaderPath = createRequire(import.meta.url).resolve('tsx');
const signalTreeFixturePath = fileURLToPath(new URL('./signal-process-tree.ts', import.meta.url));

if (mode === 'process-tree') {
	process.exitCode = await runChildProcess(process.execPath, [
		'--import',
		tsxLoaderPath,
		signalTreeFixturePath,
		process.argv[3] === 'SIGINT' ? 'SIGINT' : 'SIGTERM',
	]);
} else {
	const childSource =
		mode === 'success'
			? 'process.exit(0)'
			: mode === 'failure'
				? 'process.exit(7)'
				: mode === 'signal'
					? "process.kill(process.pid, 'SIGTERM')"
					: 'process.exit(64)';

	process.exitCode = await runChildProcess(process.execPath, ['--eval', childSource]);
}
