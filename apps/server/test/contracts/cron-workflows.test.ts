import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { promisify } from 'node:util';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const executeFile = promisify(execFile);

function extractRunScript(workflow: string): string {
	const lines = workflow.split('\n');
	const runLine = lines.findIndex((line) => line.trim() === 'run: |');
	if (runLine < 0) throw new Error('Workflow is missing a run script');
	const scriptLines: string[] = [];
	for (const line of lines.slice(runLine + 1)) {
		if (line.length > 0 && !line.startsWith('          ')) break;
		scriptLines.push(line.slice(10));
	}
	return scriptLines.join('\n').trim();
}

const workflows = [
	['daily-orders-check.yml', '/cron/auth/expired-orders-check'],
	['daily-order-proposals-check.yml', '/cron/auth/expired-proposals-check'],
] as const;

describe('scheduled workflow HTTP contract', () => {
	it.each(workflows)('URL-encodes the %s secret without putting it in the path', async (file, expectedPath) => {
		const workflow = await readFile(path.resolve(process.cwd(), '../../.github/workflows', file), 'utf8');
		const script = extractRunScript(workflow);
		const requests: URL[] = [];
		const server = createServer((request, response) => {
			requests.push(new URL(request.url ?? '/', 'http://localhost'));
			response.writeHead(204).end();
		});
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		const address = server.address();
		if (address === null || typeof address === 'string') throw new Error('Test server did not expose a TCP port');
		const secret = 'space & plus+ percent% equals= question?';
		try {
			await executeFile('/bin/sh', ['-c', script], {
				env: { ...process.env, CRON_ORIGIN: `http://127.0.0.1:${address.port}`, CRON_KEY: secret },
			});
		} finally {
			await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
		}

		expect(requests).toHaveLength(1);
		expect(requests[0]?.pathname).toBe(expectedPath);
		expect(requests[0]?.searchParams.getAll('key')).toEqual([secret]);
	});
});
