import { spawn } from 'node:child_process';

const signal = process.argv[2] === 'SIGINT' ? 'SIGINT' : 'SIGTERM';
const expectedSignalCount = process.argv[3] === '2' ? 2 : 1;
let childSignalCount = 0;

const descendantSource = `
const signal = ${JSON.stringify(signal)};
const expectedSignalCount = ${expectedSignalCount};
let signalCount = 0;
process.on(signal, () => {
	signalCount += 1;
	process.stdout.write('DESCENDANT:COUNT:' + signalCount + '\\n');
	if (signalCount === expectedSignalCount) setImmediate(() => process.exit(0));
});
process.stdout.write('DESCENDANT:READY\\n');
setInterval(() => {}, 1_000);
`;

process.on(signal, () => {
	childSignalCount += 1;
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
});

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
