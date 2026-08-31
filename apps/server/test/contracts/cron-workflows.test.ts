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
	[
		'daily-orders-check.yml',
		'/cron/auth/expired-orders-check',
		'CRON_KEY: ${{ secrets.DAILY_ORDER_CHECK_SECRET_KEY }}',
	],
	[
		'daily-order-proposals-check.yml',
		'/cron/auth/expired-proposals-check',
		'CRON_KEY: ${{ secrets.DAILY_ORDER_PROPOSALS_CHECK_SECRET_KEY }}',
	],
] as const;

async function executeWorkflow(
	file: (typeof workflows)[number][0],
	status: number,
	secret: string,
): Promise<{ requests: URL[]; execution: Promise<{ stdout: string; stderr: string }> }> {
	const workflow = await readFile(path.resolve(process.cwd(), '../../.github/workflows', file), 'utf8');
	const script = extractRunScript(workflow);
	const requests: URL[] = [];
	const server = createServer((request, response) => {
		requests.push(new URL(request.url ?? '/', 'http://localhost'));
		response.writeHead(status).end();
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const address = server.address();
	if (address === null || typeof address === 'string') throw new Error('Test server did not expose a TCP port');
	const execution = executeFile('/bin/sh', ['-c', script], {
		env: { ...process.env, CRON_ORIGIN: `http://127.0.0.1:${address.port}`, CRON_KEY: secret },
	}).finally(
		() => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
	);
	return { requests, execution };
}

describe('scheduled workflow HTTP contract', () => {
	it.each(workflows)(
		'maps the correct secret to %s and URL-encodes it without putting it in the path',
		async (file, expectedPath, expectedSecretBinding) => {
			const workflow = await readFile(path.resolve(process.cwd(), '../../.github/workflows', file), 'utf8');
			const script = extractRunScript(workflow);
			expect(workflow).toContain(expectedSecretBinding);
			expect(
				workflows.filter(([candidate]) => candidate !== file).every(([, , binding]) => !workflow.includes(binding)),
			).toBe(true);
			expect(script).toContain('--fail-with-body --silent --show-error --get');
			expect(script).toContain('--data-urlencode "key=${CRON_KEY}"');
			const secret = 'space & plus+ percent% equals= question?';
			const { requests, execution } = await executeWorkflow(file, 204, secret);
			await execution;

			expect(requests).toHaveLength(1);
			expect(requests[0]?.pathname).toBe(expectedPath);
			expect(requests[0]?.searchParams.getAll('key')).toEqual([secret]);
		},
	);

	it.each(workflows.flatMap(([file]) => [400, 500].map((status) => [file, status] as const)))(
		'exits nonzero when %s receives HTTP %i',
		async (file, status) => {
			const { requests, execution } = await executeWorkflow(file, status, 'nonempty-test-secret');

			await expect(execution).rejects.toMatchObject({ code: 22 });
			expect(requests).toHaveLength(1);
		},
	);
});
