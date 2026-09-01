import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { runChildProcess } from '../../scripts/run-api-tests';

const mode = process.argv[2];
const tsxLoaderPath = createRequire(import.meta.url).resolve('tsx');
const signalTreeFixturePath = fileURLToPath(new URL('./signal-process-tree.ts', import.meta.url));

if (mode === 'leader-exits-first') {
	const descendant = spawn(process.execPath, ['--eval', 'setInterval(() => {}, 1_000)'], {
		stdio: 'ignore',
	});
	process.stdout.write(`TREE_CHILD_PID:${process.pid}\n`);
	process.stdout.write(`DESCENDANT_PID:${String(descendant.pid)}\n`);
	process.stdout.write('LEADER:EXITING\n');
	setImmediate(() => process.exit(0));
} else if (mode === 'process-tree') {
	process.exitCode = await runChildProcess(process.execPath, [
		'--import',
		tsxLoaderPath,
		signalTreeFixturePath,
		process.argv[3] === 'SIGINT' ? 'SIGINT' : 'SIGTERM',
		process.argv[4] === '2' ? '2' : '1',
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
