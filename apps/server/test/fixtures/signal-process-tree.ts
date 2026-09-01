import { spawn } from 'node:child_process';

const signal = process.argv[2] === 'SIGINT' ? 'SIGINT' : 'SIGTERM';
let childSignalCount = 0;

const descendantSource = `
const signal = ${JSON.stringify(signal)};
let signalCount = 0;
process.on(signal, () => {
	signalCount += 1;
	process.stdout.write('DESCENDANT:COUNT:' + signalCount + '\\n');
	if (signalCount === 1) setImmediate(() => process.exit(0));
});
process.stdout.write('DESCENDANT:READY\\n');
setInterval(() => {}, 1_000);
`;

process.on(signal, () => {
	childSignalCount += 1;
	process.stdout.write(`CHILD:COUNT:${childSignalCount}\n`);
	if (childSignalCount !== 1) return;

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
descendant.stdout.setEncoding('utf8');
descendant.stdout.on('data', (chunk: string) => {
	process.stdout.write(chunk);
	if (chunk.includes('DESCENDANT:READY')) process.stdout.write('TREE:READY\n');
});

setInterval(() => {}, 1_000);
