import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { normalizeForwardedVitestArguments } from '../../scripts/run-api-tests';
import vitestConfig from '../../vitest.config';

const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const serverPackagePath = fileURLToPath(new URL('../../package.json', import.meta.url));
const serverSourcePath = fileURLToPath(new URL('../../src/', import.meta.url));
const workspaceConfigurationPath = fileURLToPath(new URL('../../../../pnpm-workspace.yaml', import.meta.url));

const expectedWorkflow = {
	name: 'Backend API',
	on: {
		pull_request: null,
		push: { branches: ['main'] },
	},
	permissions: { contents: 'read' },
	concurrency: {
		group: 'backend-api-${{ github.workflow }}-${{ github.ref }}',
		'cancel-in-progress': true,
	},
	jobs: {
		verify: {
			'runs-on': 'ubuntu-latest',
			'timeout-minutes': 30,
			steps: [
				{ uses: 'actions/checkout@v4' },
				{ uses: 'actions/setup-node@v4', with: { 'node-version': 22 } },
				{ name: 'Enable Corepack', run: 'corepack enable' },
				{ name: 'Install frozen dependencies', run: 'pnpm install --frozen-lockfile' },
				{ name: 'Lint server', run: 'pnpm --filter @workspace/server lint' },
				{ name: 'Typecheck server', run: 'pnpm --filter @workspace/server typecheck' },
				{ name: 'Build server', run: 'pnpm --filter @workspace/server build' },
				{
					name: 'Verify API coverage',
					run: 'pnpm --filter @workspace/server test:api:coverage -- --sequence.shuffle --sequence.seed=211',
				},
				{ name: 'Verify OpenAPI artifact', run: 'pnpm --filter @workspace/server api:check' },
			],
		},
	},
};

const forbiddenEnvironmentName =
	/(?:^|_)(?:POSTGRES|DATABASE|AWS|SMTP|TOKEN|PROVIDER|PAYMENT_PROVIDER|SHIPMENT|SHIPPING|JWT|ACCESS_TOKEN|REFRESH_TOKEN|COOKIE|CRON)(?:_|$)|^(?:DAILY_ORDER_CHECK_SECRET_KEY|DAILY_ORDER_PROPOSALS_CHECK_SECRET_KEY|TRANSACTIONS_SYNC_SECRET_KEY)$/i;

async function listTypeScriptFiles(directory: string, relativeDirectory = ''): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const nested = await Promise.all(
		entries.map(async (entry) => {
			const relativePath = relativeDirectory === '' ? entry.name : `${relativeDirectory}/${entry.name}`;
			if (entry.isDirectory()) return listTypeScriptFiles(`${directory}/${entry.name}`, relativePath);
			return entry.isFile() && entry.name.endsWith('.ts') ? [relativePath] : [];
		}),
	);
	return nested.flat();
}

function credentialReferences(value: unknown, parentKey?: string): string[] {
	if (typeof value === 'string') return /\$\{\{\s*secrets\./i.test(value) ? ['secret-expression'] : [];
	if (Array.isArray(value)) return value.flatMap((entry) => credentialReferences(entry));
	if (value === null || typeof value !== 'object') return [];

	return Object.entries(value).flatMap(([key, entry]) => [
		...(parentKey === 'env' && forbiddenEnvironmentName.test(key) ? [`environment:${key}`] : []),
		...credentialReferences(entry, key),
	]);
}

describe('backend API CI gate', () => {
	it('covers exactly every API runtime source file with only approved generated/bootstrap exclusions', async () => {
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

		const runtimeFiles = (await listTypeScriptFiles(serverSourcePath)).filter(
			(file) =>
				!file.startsWith('database/drizzle/migrations/') &&
				!file.startsWith('database/scripts/') &&
				file !== 'database/drizzle.config.ts' &&
				file !== 'index.ts' &&
				!file.endsWith('.d.ts'),
		);
		expect(runtimeFiles).toHaveLength(154);
	});

	it('passes sequence options through the documented pnpm separator to Vitest', async () => {
		const serverPackage = JSON.parse(await readFile(serverPackagePath, 'utf8')) as {
			devDependencies: Record<string, string>;
			scripts: Record<string, string>;
		};
		const workspaceConfiguration = parse(await readFile(workspaceConfigurationPath, 'utf8')) as {
			ignoredBuiltDependencies: string[];
			onlyBuiltDependencies: string[];
		};

		expect(normalizeForwardedVitestArguments(['--', '--sequence.shuffle', '--sequence.seed=211'])).toEqual([
			'--sequence.shuffle',
			'--sequence.seed=211',
		]);
		expect(serverPackage.scripts['test:api']).toBe('tsx scripts/run-api-tests.ts');
		expect(serverPackage.scripts['test:api:coverage']).toBe('tsx scripts/run-api-tests.ts --coverage');
		expect(serverPackage.devDependencies.yaml).toBe('2.8.0');
		expect(workspaceConfiguration.onlyBuiltDependencies).toEqual(['esbuild']);
		expect(workspaceConfiguration.ignoredBuiltDependencies).toEqual([
			'@tailwindcss/oxide',
			'core-js-pure',
			'cpu-features',
			'protobufjs',
			'sharp',
			'ssh2',
			'unrs-resolver',
		]);
	});

	it('parses the exact deterministic Node 22 backend contract gate as YAML 1.2', async () => {
		const workflow = await readFile(`${repositoryRoot}.github/workflows/backend-api.yml`, 'utf8');
		const parsedWorkflow = parse(workflow);

		expect(parsedWorkflow).toEqual(expectedWorkflow);
		expect(credentialReferences(parsedWorkflow)).toEqual([]);

		const commentedCommand = workflow.replace(
			'        run: pnpm install --frozen-lockfile',
			'        # run: pnpm install --frozen-lockfile',
		);
		expect(parse(commentedCommand)).not.toEqual(expectedWorkflow);

		const wronglyNestedPermissions = workflow.replace(
			'permissions:\n  contents: read',
			'permissions:\n  contents:\n    read: true',
		);
		expect(parse(wronglyNestedPermissions)).not.toEqual(expectedWorkflow);
	});

	it.each([
		'POSTGRES_PASSWORD',
		'DATABASE_URL',
		'AWS_ACCESS_KEY_ID',
		'SMTP_PASSWORD',
		'TOKEN_SECRET',
		'PROVIDER_API_KEY',
		'PAYMENT_PROVIDER_API_KEY',
		'SHIPMENT_PROVIDER_API_KEY',
		'SHIPPING_PROVIDER_API_KEY',
		'JWT_SECRET',
		'ACCESS_TOKEN_SECRET',
		'REFRESH_TOKEN_SECRET',
		'EMAIL_VERIFY_TOKEN_SECRET',
		'RESET_TOKEN_SECRET',
		'COOKIE_SECRET',
		'EXPIRED_ORDERS_CRON_SECRET',
		'DAILY_ORDER_CHECK_SECRET_KEY',
		'DAILY_ORDER_PROPOSALS_CHECK_SECRET_KEY',
		'TRANSACTIONS_SYNC_SECRET_KEY',
	])('rejects a credential-bearing CI environment key %s', (environmentName) => {
		const mutated = structuredClone(expectedWorkflow) as typeof expectedWorkflow & {
			jobs: { verify: { env?: Record<string, string> } };
		};
		mutated.jobs.verify.env = { [environmentName]: 'test-only-placeholder' };
		expect(credentialReferences(mutated)).toContain(`environment:${environmentName}`);
	});

	it('rejects GitHub secret expressions anywhere in the workflow scalar graph', () => {
		const mutated = {
			...expectedWorkflow,
			jobs: {
				verify: {
					...expectedWorkflow.jobs.verify,
					steps: [
						{ uses: 'actions/checkout@v4', with: { token: '${{ secrets.CI_TOKEN }}' } },
						...expectedWorkflow.jobs.verify.steps.slice(1),
					],
				},
			},
		};
		expect(credentialReferences(mutated)).toContain('secret-expression');
	});
});
