import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { normalizeForwardedVitestArguments } from '../../scripts/run-api-tests';
import vitestConfig from '../../vitest.config';

const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const serverPackagePath = fileURLToPath(new URL('../../package.json', import.meta.url));

describe('backend API CI gate', () => {
	it('covers every runtime source file with only approved generated/bootstrap exclusions', () => {
		const coverage = vitestConfig.test?.coverage;

		expect(vitestConfig.test?.maxWorkers).toBe(4);
		expect(coverage).toMatchObject({
			all: true,
			include: ['src/**/*.ts'],
			ignoreEmptyLines: true,
			thresholds: { branches: 85, functions: 90, lines: 90 },
		});
		expect(coverage?.exclude).toEqual([
			'src/database/drizzle/migrations/**',
			'src/database/scripts/**',
			'src/database/drizzle.config.ts',
			'src/index.ts',
			'**/*.d.ts',
		]);
	});

	it('passes sequence options through the documented pnpm separator to Vitest', async () => {
		const serverPackage = JSON.parse(await readFile(serverPackagePath, 'utf8')) as {
			scripts: Record<string, string>;
		};

		expect(normalizeForwardedVitestArguments(['--', '--sequence.shuffle', '--sequence.seed=211'])).toEqual([
			'--sequence.shuffle',
			'--sequence.seed=211',
		]);
		expect(serverPackage.scripts['test:api']).toBe('tsx scripts/run-api-tests.ts');
		expect(serverPackage.scripts['test:api:coverage']).toBe('tsx scripts/run-api-tests.ts --coverage');
	});

	it('runs the deterministic Node 22 backend contract gate without repository secrets', async () => {
		const workflow = await readFile(`${repositoryRoot}.github/workflows/backend-api.yml`, 'utf8');

		expect(workflow).toContain('pull_request:');
		expect(workflow).toContain('branches: [main]');
		expect(workflow).toContain('permissions:\n  contents: read');
		expect(workflow).toContain('runs-on: ubuntu-latest');
		expect(workflow).toContain('timeout-minutes: 30');
		expect(workflow).toContain('uses: actions/checkout@v4');
		expect(workflow).toContain('uses: actions/setup-node@v4');
		expect(workflow).toContain('node-version: 22');
		expect(workflow).toContain('run: corepack enable');
		expect(workflow).toContain('run: pnpm install --frozen-lockfile');

		const commands = [
			'pnpm --filter @workspace/server lint',
			'pnpm --filter @workspace/server typecheck',
			'pnpm --filter @workspace/server build',
			'pnpm --filter @workspace/server test:api:coverage -- --sequence.shuffle --sequence.seed=211',
			'pnpm --filter @workspace/server api:check',
		];
		for (const command of commands) expect(workflow).toContain(`run: ${command}`);

		expect(workflow).not.toMatch(/\b(cache|secrets|POSTGRES_|AWS_|SMTP_|TOKEN_|PROVIDER_)\b/);
	});
});
