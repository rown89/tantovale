import { runChildProcess } from '../../scripts/run-api-tests';

const mode = process.argv[2];
const childSource =
	mode === 'success'
		? 'process.exit(0)'
		: mode === 'failure'
			? 'process.exit(7)'
			: mode === 'signal'
				? "process.kill(process.pid, 'SIGTERM')"
				: mode === 'forwarded-signal'
					? "process.once('SIGTERM', () => process.exit(0)); process.stdout.write('READY\\n'); setInterval(() => {}, 1_000)"
					: 'process.exit(64)';

process.exitCode = await runChildProcess(process.execPath, ['--eval', childSource]);
