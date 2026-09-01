import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { resolveSignalBurstMode, runChildProcess } from '../../scripts/run-api-tests';

const mode = process.argv[2];
const tsxLoaderPath = createRequire(import.meta.url).resolve('tsx');
const signalTreeFixturePath = fileURLToPath(new URL('./signal-process-tree.ts', import.meta.url));

function startWrapperEventLoopPressure(): () => void {
	let active = true;
	const stopAt = performance.now() + 1_000;
	const pressureTurn = () => {
		setImmediate(() => {
			if (!active) return;
			const deadline = performance.now() + 20;
			while (performance.now() < deadline) Math.sqrt(deadline);
			if (performance.now() < stopAt) pressureTurn();
		});
	};

	pressureTurn();
	process.stdout.write('WRAPPER_PRESSURE:READY\n');
	return () => {
		active = false;
	};
}

if (mode === 'leader-exits-first') {
	const descendant = spawn(process.execPath, ['--eval', 'setInterval(() => {}, 1_000)'], {
		stdio: 'ignore',
	});
	process.stdout.write(`TREE_CHILD_PID:${process.pid}\n`);
	process.stdout.write(`DESCENDANT_PID:${String(descendant.pid)}\n`);
	process.stdout.write('LEADER:EXITING\n');
	setImmediate(() => process.exit(0));
} else if (mode === 'process-tree') {
	const forwardedSignal = process.argv[3] === 'SIGINT' ? 'SIGINT' : 'SIGTERM';
	const stopPressure = process.argv[5] === 'pressure' ? startWrapperEventLoopPressure() : () => undefined;
	try {
		process.exitCode = await runChildProcess(
			process.execPath,
			['--import', tsxLoaderPath, signalTreeFixturePath, forwardedSignal, process.argv[4] ?? '1'],
			undefined,
			{ signalBurstMode: resolveSignalBurstMode(process.env) },
		);
	} finally {
		stopPressure();
	}
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
