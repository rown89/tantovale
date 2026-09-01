import { spawn } from 'node:child_process';

const parsedExpectedSignalCount = Number(process.argv[3]);
const expectedSignalCount = [1, 2, 3].includes(parsedExpectedSignalCount) ? parsedExpectedSignalCount : 1;
let childSignalCount = 0;
const childSignalCounts = { SIGINT: 0, SIGTERM: 0 };

const descendantSource = `
const expectedSignalCount = ${expectedSignalCount};
let signalCount = 0;
const signalCounts = { SIGINT: 0, SIGTERM: 0 };
const handleSignal = (signal) => {
	signalCount += 1;
	signalCounts[signal] += 1;
	process.stdout.write('DESCENDANT:' + signal + ':COUNT:' + signalCounts[signal] + '\\n');
	process.stdout.write('DESCENDANT:COUNT:' + signalCount + '\\n');
	if (signalCount === expectedSignalCount) setImmediate(() => process.exit(0));
};
process.on('SIGINT', () => handleSignal('SIGINT'));
process.on('SIGTERM', () => handleSignal('SIGTERM'));
process.stdout.write('DESCENDANT:READY\\n');
setInterval(() => {}, 1_000);
`;

const handleChildSignal = (signal: 'SIGINT' | 'SIGTERM') => {
	childSignalCount += 1;
	childSignalCounts[signal] += 1;
	process.stdout.write(`CHILD:${signal}:COUNT:${childSignalCounts[signal]}\n`);
	process.stdout.write(`CHILD:COUNT:${childSignalCount}\n`);
	if (childSignalCount !== expectedSignalCount) return;

	if (descendant.exitCode !== null || descendant.signalCode !== null) {
		process.stdout.write('DESCENDANT:CLOSED\n');
		setImmediate(() => process.exit(0));
		return;
	}

	descendant.once('close', () => {
		process.stdout.write('DESCENDANT:CLOSED\n');
		setImmediate(() => process.exit(0));
	});
};
process.on('SIGINT', () => handleChildSignal('SIGINT'));
process.on('SIGTERM', () => handleChildSignal('SIGTERM'));

const descendant = spawn(process.execPath, ['--eval', descendantSource], {
	stdio: ['ignore', 'pipe', 'inherit'],
});

process.stdout.write(`TREE_CHILD_PID:${process.pid}\n`);
process.stdout.write(`DESCENDANT_PID:${String(descendant.pid)}\n`);
descendant.stdout.setEncoding('utf8');
descendant.stdout.on('data', (chunk: string) => {
	process.stdout.write(chunk);
	if (chunk.includes('DESCENDANT:READY')) process.stdout.write('TREE:READY\n');
});

setInterval(() => {}, 1_000);
