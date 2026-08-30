# Backend API Verification Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the deterministic Vitest/Testcontainers foundation, isolated PostgreSQL databases, local MinIO and Mailpit services, reusable test helpers, and an executable inventory for all mounted Hono routes.

**Architecture:** Vitest starts disposable services once through global setup, then assigns one cloned PostgreSQL database and one MinIO bucket to each worker. Test setup configures environment variables before importing the application, resets only the current worker database and bucket, and leaves Mailpit messages isolated by unique recipient. A route registry is compared with Hono's normalized mounted routes so additions and removals cannot pass silently.

**Tech Stack:** Node 22, pnpm, Vitest, V8 coverage, Testcontainers, PostgreSQL 17, Drizzle ORM, MinIO, Mailpit, Hono `app.request()`.

---

**Approved design:** `docs/superpowers/specs/2026-08-30-backend-api-verification-design.md`

## File map

### Files created

- `apps/server/vitest.config.ts` — API-test discovery, setup, worker count, ordering, and coverage thresholds.
- `apps/server/tsconfig.build.json` — production TypeScript build boundary that excludes tests.
- `apps/server/test/vitest.d.ts` — typed Vitest global-setup values.
- `apps/server/test/infrastructure/runtime.ts` — runtime types, safe names, and environment construction.
- `apps/server/test/infrastructure/runtime.test.ts` — unit tests for destructive-operation guards.
- `apps/server/test/infrastructure/containers.ts` — PostgreSQL, MinIO, and Mailpit container startup.
- `apps/server/test/infrastructure/containers.test.ts` — pinned-image health smoke test.
- `apps/server/test/infrastructure/database-admin.ts` — template migration and worker-database cloning.
- `apps/server/test/infrastructure/object-storage-admin.ts` — worker bucket creation and cleanup.
- `apps/server/test/infrastructure/global-setup.ts` — owns the disposable-service lifecycle.
- `apps/server/test/infrastructure/isolation.test.ts` — repeated proof that worker state is reset.
- `apps/server/test/setup.ts` — assigns worker resources and resets state before every test.
- `apps/server/test/helpers/database.ts` — per-test truncation and database access.
- `apps/server/test/helpers/object-storage.ts` — per-worker object cleanup.
- `apps/server/test/helpers/request.ts` — JSON requests and cookie-jar handling for `app.request()`.
- `apps/server/test/helpers/mailpit.ts` — recipient-scoped email polling and link extraction.
- `apps/server/test/helpers/helpers.test.ts` — focused cookie and email helper behavior.
- `apps/server/test/fixtures/factories.ts` — typed minimal factories shared by later plans.
- `apps/server/test/contracts/route-registry.ts` — all 63 normalized mounted route contracts.
- `apps/server/test/contracts/route-parity.test.ts` — Hono route-to-registry parity.
- `apps/server/test/routes/documentation.test.ts` — first in-process route smoke tests.

### Files modified

- `apps/server/package.json` — test scripts and development dependencies.
- `apps/server/tsconfig.json` — test typing remains in typecheck while build gets a separate config.
- `apps/server/src/env.ts` — local S3 endpoint/path-style and SMTP sender configuration.
- `apps/server/src/lib/s3client.ts` — use configured bucket and MinIO-compatible options.
- `apps/server/src/mailer/lib/createMailer.ts` — allow SMTP servers that do not advertise authentication.
- `apps/server/src/mailer/templates/verify-email.ts` — use the configured sender address.
- `apps/server/src/mailer/templates/forgot-password-email.ts` — use the configured sender address.
- `pnpm-lock.yaml` — lock the explicitly added test dependencies.

## Task 1: Add the test runner and preserve the production build boundary

**Files:**

- Modify: `apps/server/package.json:6-26,123-130`
- Modify: `apps/server/tsconfig.json:1-27`
- Create: `apps/server/tsconfig.build.json`
- Create: `apps/server/vitest.config.ts`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Prove the test entry point is absent**

Run:

```bash
pnpm --filter @workspace/server test:api
```

Expected: FAIL because `test:api` is not defined.

- [ ] **Step 2: Install only the approved test dependencies**

Run from the repository root:

```bash
pnpm --filter @workspace/server add --save-dev vitest @vitest/coverage-v8 testcontainers
```

Expected: `apps/server/package.json` and `pnpm-lock.yaml` change; no other workspace manifest changes.

- [ ] **Step 3: Add deterministic package scripts**

Add these entries to `apps/server/package.json` without changing existing database scripts:

```json
{
	"scripts": {
		"build": "tsc -p tsconfig.build.json && tsc-alias -p tsconfig.build.json",
		"test": "vitest run --config vitest.config.ts",
		"test:api": "vitest run --config vitest.config.ts",
		"test:api:watch": "vitest --config vitest.config.ts",
		"test:api:coverage": "vitest run --config vitest.config.ts --coverage"
	}
}
```

- [ ] **Step 4: Keep tests in typecheck but out of production output**

Create `apps/server/tsconfig.build.json`:

```json
{
	"extends": "./tsconfig.json",
	"exclude": ["node_modules", "dist", "test", "vitest.config.ts"]
}
```

Keep `apps/server/tsconfig.json` inclusive so `pnpm --filter @workspace/server typecheck` checks test code. Add Vitest globals explicitly:

```json
{
	"compilerOptions": {
		"types": ["node", "vitest/globals"]
	}
}
```

- [ ] **Step 5: Configure Vitest**

Create `apps/server/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['test/**/*.test.ts'],
		pool: 'forks',
		maxWorkers: 4,
		fileParallelism: true,
		sequence: {
			shuffle: true,
		},
		testTimeout: 30_000,
		hookTimeout: 60_000,
		coverage: {
			provider: 'v8',
			include: ['src/**/*.ts'],
			exclude: ['src/database/drizzle/migrations/**'],
			thresholds: {
				lines: 90,
				functions: 90,
				branches: 85,
			},
		},
	},
});
```

- [ ] **Step 6: Verify configuration loading**

Run:

```bash
pnpm --filter @workspace/server exec vitest list --config vitest.config.ts
pnpm --filter @workspace/server typecheck
pnpm --filter @workspace/server build
```

Expected: Vitest reports no tests yet; typecheck and build pass; `dist/test` does not exist. Task 4 adds `globalSetup` and Task 6 adds `setupFiles` only after those files exist.

- [ ] **Step 7: Commit the runner boundary**

```bash
git add apps/server/package.json apps/server/tsconfig.json apps/server/tsconfig.build.json apps/server/vitest.config.ts pnpm-lock.yaml
git commit -m "test(server): add API test runner"
```

## Task 2: Define guarded disposable runtime configuration

**Files:**

- Create: `apps/server/test/infrastructure/runtime.ts`
- Create: `apps/server/test/infrastructure/runtime.test.ts`
- Create: `apps/server/test/vitest.d.ts`

- [ ] **Step 1: Write failing guard tests**

Create `apps/server/test/infrastructure/runtime.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { assertDisposableDatabaseName, createResourceNames } from './runtime';

describe('test runtime guards', () => {
	it.each(['tantovale_dev', 'tantovale', 'postgres', 'template1', ''])('rejects unsafe database %j', (name) => {
		expect(() => assertDisposableDatabaseName(name)).toThrow(/disposable test database/i);
	});

	it('creates a template and four worker resources with a test-only prefix', () => {
		const names = createResourceNames('a1b2c3d4', 4);

		expect(names.templateDatabase).toBe('tantovale_test_a1b2c3d4_template');
		expect(names.workerDatabases).toEqual([
			'tantovale_test_a1b2c3d4_worker_1',
			'tantovale_test_a1b2c3d4_worker_2',
			'tantovale_test_a1b2c3d4_worker_3',
			'tantovale_test_a1b2c3d4_worker_4',
		]);
		expect(names.workerBuckets).toEqual([
			'tantovale-test-a1b2c3d4-worker-1',
			'tantovale-test-a1b2c3d4-worker-2',
			'tantovale-test-a1b2c3d4-worker-3',
			'tantovale-test-a1b2c3d4-worker-4',
		]);
	});
});
```

- [ ] **Step 2: Run the focused test and observe the missing module failure**

Run:

```bash
pnpm --filter @workspace/server exec vitest run test/infrastructure/runtime.test.ts --config vitest.config.ts
```

Expected: FAIL because `runtime.ts` does not exist.

- [ ] **Step 3: Implement names, guards, and runtime types**

Create `apps/server/test/infrastructure/runtime.ts`:

```ts
export const API_TEST_WORKERS = 4;

export type ResourceNames = {
	templateDatabase: string;
	workerDatabases: string[];
	workerBuckets: string[];
};

export type TestRuntime = {
	runId: string;
	workerCount: number;
	resourceNames: ResourceNames;
	postgres: {
		host: string;
		port: number;
		user: string;
		password: string;
	};
	minio: {
		endpoint: string;
		accessKey: string;
		secretKey: string;
	};
	mailpit: {
		smtpHost: string;
		smtpPort: number;
		apiUrl: string;
	};
};

export function assertDisposableDatabaseName(name: string): void {
	if (!/^tantovale_test_[a-z0-9]+_(template|worker_[1-9][0-9]*)$/.test(name)) {
		throw new Error(`Refusing destructive operation: ${name || '<empty>'} is not a disposable test database`);
	}
}

export function createResourceNames(runId: string, workerCount: number): ResourceNames {
	if (!/^[a-z0-9]+$/.test(runId) || workerCount < 1) {
		throw new Error('Invalid test resource namespace');
	}

	const databasePrefix = `tantovale_test_${runId}`;
	const bucketPrefix = `tantovale-test-${runId}`;

	return {
		templateDatabase: `${databasePrefix}_template`,
		workerDatabases: Array.from({ length: workerCount }, (_, index) => `${databasePrefix}_worker_${index + 1}`),
		workerBuckets: Array.from({ length: workerCount }, (_, index) => `${bucketPrefix}-worker-${index + 1}`),
	};
}

export function getWorkerIndex(workerId: string | undefined, workerCount: number): number {
	const parsed = Number(workerId ?? '1');
	if (!Number.isInteger(parsed) || parsed < 1 || parsed > workerCount) {
		throw new Error(`Invalid Vitest worker id: ${workerId ?? '<missing>'}`);
	}
	return parsed - 1;
}

export function buildServerEnvironment(runtime: TestRuntime, database: string, bucket: string): NodeJS.ProcessEnv {
	assertDisposableDatabaseName(database);
	return {
		NODE_ENV: 'test',
		LOG_LEVEL: 'silent',
		PROJECT_NAME: 'Tantovale API tests',
		NEXT_PUBLIC_HONO_API_URL: 'http://localhost:4000',
		SERVER_HOSTNAME: 'localhost',
		SERVER_PORT: '4000',
		STOREFRONT_HOSTNAME: 'http://storefront.test',
		STOREFRONT_PORT: '3000',
		POSTGRES_USER: runtime.postgres.user,
		POSTGRES_PASSWORD: runtime.postgres.password,
		DATABASE_HOST: runtime.postgres.host,
		DATABASE_PORT: String(runtime.postgres.port),
		POSTGRES_DB: database,
		PAYMENT_PROVIDER_API_URL: 'http://127.0.0.1:9',
		PAYMENT_PROVIDER_API_VERSION: 'api/v1',
		PAYMENT_PROVIDER_API_KEY: 'trustap-test-key',
		PAYMENT_PROVIDER_CLIENT_ID: 'trustap-test-client',
		PAYMENT_PROVIDER_CLIENT_SECRET: 'trustap-test-client-secret',
		PAYMENT_PROVIDER_WEBHOOK_SECRET: 'trustap-webhook-test-secret',
		PAYMENT_PROVIDER_PAY_PAGE_URL: 'http://trustap.test/pay',
		POST_PAYMENT_REDIRECT_URL: 'http://storefront.test',
		SHIPPING_PROVIDER_API_KEY: 'shippo-test-key',
		SHIPPING_PROVIDER_WEBHOOK_SECRET: 'shippo-webhook-test-secret',
		ACCESS_TOKEN_SECRET: 'access-test-secret-at-least-32-characters',
		REFRESH_TOKEN_SECRET: 'refresh-test-secret-at-least-32-characters',
		EMAIL_VERIFY_TOKEN_SECRET: 'verify-test-secret-at-least-32-characters',
		RESET_TOKEN_SECRET: 'reset-test-secret-at-least-32-characters',
		COOKIE_SECRET: 'cookie-test-secret-at-least-32-characters',
		AWS_REGION: 'eu-west-1',
		AWS_ACCESS_KEY: runtime.minio.accessKey,
		AWS_SECRET_ACCESS_KEY: runtime.minio.secretKey,
		AWS_BUCKET_NAME: bucket,
		AWS_ENDPOINT: runtime.minio.endpoint,
		AWS_FORCE_PATH_STYLE: 'true',
		SMTP_HOST: runtime.mailpit.smtpHost,
		SMTP_PORT: String(runtime.mailpit.smtpPort),
		SMTP_USER: '',
		SMTP_PASS: '',
		SMTP_FROM: 'Tantovale <noreply@tantovale.test>',
		DAILY_ORDER_CHECK_SECRET_KEY: 'orders-cron-test-key',
		DAILY_ORDER_PROPOSALS_CHECK_SECRET_KEY: 'proposals-cron-test-key',
		TRANSACTIONS_SYNC_SECRET_KEY: 'transactions-cron-test-key',
		PROPOSALS_HANDLING_TOLLERANCE_IN_HOURS: '96',
		ORDERS_PAYMENT_HANDLING_TOLLERANCE_IN_HOURS: '48',
	};
}
```

- [ ] **Step 4: Declare the provided runtime type**

Create `apps/server/test/vitest.d.ts`:

```ts
import 'vitest';
import type { TestRuntime } from './infrastructure/runtime';

declare module 'vitest' {
	export interface ProvidedContext {
		testRuntime: TestRuntime;
	}
}
```

- [ ] **Step 5: Run the guard test**

```bash
pnpm --filter @workspace/server exec vitest run test/infrastructure/runtime.test.ts --config vitest.config.ts
```

Expected: PASS; unsafe database names are rejected and resource names are deterministic.

- [ ] **Step 6: Commit the guard**

```bash
git add apps/server/test/vitest.d.ts apps/server/test/infrastructure/runtime.ts apps/server/test/infrastructure/runtime.test.ts
git commit -m "test(server): guard disposable test resources"
```

## Task 3: Start PostgreSQL, MinIO, and Mailpit

**Files:**

- Create: `apps/server/test/infrastructure/containers.ts`
- Create: `apps/server/test/infrastructure/containers.test.ts`

- [ ] **Step 1: Add a failing container smoke test**

Create `apps/server/test/infrastructure/containers.test.ts`:

```ts
import { afterAll, describe, expect, it } from 'vitest';
import type { StartedInfrastructure } from './containers';
import { startInfrastructure } from './containers';

describe('disposable service images', () => {
	let started: StartedInfrastructure | undefined;

	afterAll(async () => {
		if (started) await Promise.all(Object.values(started).map((container) => container.stop()));
	});

	it('starts PostgreSQL, MinIO, and Mailpit', async () => {
		started = await startInfrastructure();
		const apiUrl = `http://${started.mailpit.getHost()}:${started.mailpit.getMappedPort(8025)}`;
		const response = await fetch(`${apiUrl}/api/v1/info`);

		expect(started.postgres.getMappedPort(5432)).toBeGreaterThan(0);
		expect(started.minio.getMappedPort(9000)).toBeGreaterThan(0);
		expect(response.ok).toBe(true);
	});
});
```

Expected before implementation: FAIL because `containers.ts` does not exist.

- [ ] **Step 2: Implement container startup**

Create `apps/server/test/infrastructure/containers.ts`:

```ts
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';

export type StartedInfrastructure = {
	postgres: StartedTestContainer;
	minio: StartedTestContainer;
	mailpit: StartedTestContainer;
};

export async function startInfrastructure(): Promise<StartedInfrastructure> {
	const [postgres, minio, mailpit] = await Promise.all([
		new GenericContainer('postgres:17-alpine')
			.withEnvironment({
				POSTGRES_USER: 'tantovale_test',
				POSTGRES_PASSWORD: 'tantovale_test',
				POSTGRES_DB: 'postgres',
			})
			.withExposedPorts(5432)
			.withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/))
			.start(),
		new GenericContainer('minio/minio:RELEASE.2025-04-22T22-12-26Z')
			.withEnvironment({
				MINIO_ROOT_USER: 'tantovale_test',
				MINIO_ROOT_PASSWORD: 'tantovale_test_secret',
			})
			.withCommand(['server', '/data', '--console-address', ':9001'])
			.withExposedPorts(9000)
			.withWaitStrategy(Wait.forListeningPorts())
			.start(),
		new GenericContainer('axllent/mailpit:v1.27.8')
			.withExposedPorts(1025, 8025)
			.withWaitStrategy(Wait.forListeningPorts())
			.start(),
	]);

	return { postgres, minio, mailpit };
}
```

- [ ] **Step 3: Verify image startup**

```bash
pnpm --filter @workspace/server exec vitest run test/infrastructure/containers.test.ts --config vitest.config.ts
```

Expected: the three containers become healthy and the Mailpit information endpoint returns 200.

- [ ] **Step 4: Commit container definitions**

```bash
git add apps/server/test/infrastructure/containers.ts apps/server/test/infrastructure/containers.test.ts
git commit -m "test(server): provision local API dependencies"
```

## Task 4: Migrate a template database and clone worker databases

**Files:**

- Create: `apps/server/test/infrastructure/database-admin.ts`
- Create: `apps/server/test/infrastructure/object-storage-admin.ts`
- Create: `apps/server/test/infrastructure/global-setup.ts`
- Modify: `apps/server/vitest.config.ts`

- [ ] **Step 1: Implement safe database administration**

Create `apps/server/test/infrastructure/database-admin.ts`:

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import pg from 'pg';
import { assertDisposableDatabaseName, buildServerEnvironment, type TestRuntime } from './runtime';

const execFileAsync = promisify(execFile);

function quoteIdentifier(value: string): string {
	return `"${value.replaceAll('"', '""')}"`;
}

function connection(runtime: TestRuntime, database: string) {
	return {
		host: runtime.postgres.host,
		port: runtime.postgres.port,
		user: runtime.postgres.user,
		password: runtime.postgres.password,
		database,
	};
}

export async function createMigratedDatabases(runtime: TestRuntime): Promise<void> {
	const { templateDatabase, workerDatabases } = runtime.resourceNames;
	assertDisposableDatabaseName(templateDatabase);
	workerDatabases.forEach(assertDisposableDatabaseName);

	const admin = new pg.Client(connection(runtime, 'postgres'));
	await admin.connect();
	await admin.query(`CREATE DATABASE ${quoteIdentifier(templateDatabase)}`);
	await admin.end();

	await execFileAsync('pnpm', ['exec', 'drizzle-kit', 'migrate', '--config', './src/database/drizzle.config.ts'], {
		cwd: process.cwd(),
		env: {
			...process.env,
			...buildServerEnvironment(runtime, templateDatabase, runtime.resourceNames.workerBuckets[0]!),
		},
	});

	const cloneAdmin = new pg.Client(connection(runtime, 'postgres'));
	await cloneAdmin.connect();
	for (const workerDatabase of workerDatabases) {
		await cloneAdmin.query(
			`CREATE DATABASE ${quoteIdentifier(workerDatabase)} TEMPLATE ${quoteIdentifier(templateDatabase)}`,
		);
	}
	await cloneAdmin.end();
}
```

- [ ] **Step 2: Implement worker bucket creation**

Create `apps/server/test/infrastructure/object-storage-admin.ts`:

```ts
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import type { TestRuntime } from './runtime';

export async function createWorkerBuckets(runtime: TestRuntime): Promise<void> {
	const client = new S3Client({
		endpoint: runtime.minio.endpoint,
		region: 'eu-west-1',
		forcePathStyle: true,
		credentials: {
			accessKeyId: runtime.minio.accessKey,
			secretAccessKey: runtime.minio.secretKey,
		},
	});

	for (const bucket of runtime.resourceNames.workerBuckets) {
		await client.send(new CreateBucketCommand({ Bucket: bucket }));
	}

	client.destroy();
}
```

- [ ] **Step 3: Implement global lifecycle ownership**

Create `apps/server/test/infrastructure/global-setup.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type { GlobalSetupContext } from 'vitest/node';
import { startInfrastructure } from './containers';
import { createMigratedDatabases } from './database-admin';
import { createWorkerBuckets } from './object-storage-admin';
import { API_TEST_WORKERS, createResourceNames, type TestRuntime } from './runtime';

export default async function globalSetup({ provide }: GlobalSetupContext) {
	const started = await startInfrastructure();
	const runId = randomUUID().replaceAll('-', '').slice(0, 8);

	const runtime: TestRuntime = {
		runId,
		workerCount: API_TEST_WORKERS,
		resourceNames: createResourceNames(runId, API_TEST_WORKERS),
		postgres: {
			host: started.postgres.getHost(),
			port: started.postgres.getMappedPort(5432),
			user: 'tantovale_test',
			password: 'tantovale_test',
		},
		minio: {
			endpoint: `http://${started.minio.getHost()}:${started.minio.getMappedPort(9000)}`,
			accessKey: 'tantovale_test',
			secretKey: 'tantovale_test_secret',
		},
		mailpit: {
			smtpHost: started.mailpit.getHost(),
			smtpPort: started.mailpit.getMappedPort(1025),
			apiUrl: `http://${started.mailpit.getHost()}:${started.mailpit.getMappedPort(8025)}`,
		},
	};

	const containers = [started.mailpit, started.minio, started.postgres];

	try {
		await createMigratedDatabases(runtime);
		await createWorkerBuckets(runtime);
		provide('testRuntime', runtime);
	} catch (error) {
		await Promise.allSettled(containers.map((container) => container.stop()));
		throw error;
	}

	return async () => {
		await Promise.allSettled(containers.map((container) => container.stop()));
	};
}
```

- [ ] **Step 4: Enable the global setup after its file exists**

Add this property beside `include` in `apps/server/vitest.config.ts`:

```ts
globalSetup: ['./test/infrastructure/global-setup.ts'],
```

- [ ] **Step 5: Run the runtime smoke test**

Run:

```bash
pnpm --filter @workspace/server exec vitest run test/infrastructure/runtime.test.ts --config vitest.config.ts
```

Expected: PASS; Drizzle migration runs once, four worker databases are cloned, and all containers stop after the run.

- [ ] **Step 6: Commit infrastructure lifecycle**

```bash
git add apps/server/vitest.config.ts apps/server/test/infrastructure/database-admin.ts apps/server/test/infrastructure/object-storage-admin.ts apps/server/test/infrastructure/global-setup.ts
git commit -m "test(server): isolate API test infrastructure"
```

## Task 5: Make S3 and SMTP local-service compatible

**Files:**

- Modify: `apps/server/src/env.ts:59-68`
- Modify: `apps/server/src/lib/s3client.ts:1-22`
- Modify: `apps/server/src/mailer/lib/createMailer.ts:1-13`
- Modify: `apps/server/src/mailer/templates/verify-email.ts:1-18`
- Modify: `apps/server/src/mailer/templates/forgot-password-email.ts:1-18`
- Create: `apps/server/test/infrastructure/local-services-config.test.ts`

- [ ] **Step 1: Write failing local-service configuration tests**

Create `apps/server/test/infrastructure/local-services-config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createMailer } from '../../src/mailer/lib/createMailer';
import { environment } from '../../src/utils/constants';

describe('local service configuration', () => {
	it('uses the isolated MinIO endpoint and bucket', () => {
		expect(environment.AWS_ENDPOINT).toMatch(/^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
		expect(environment.AWS_FORCE_PATH_STYLE).toBe(true);
		expect(environment.AWS_BUCKET_NAME).toMatch(/^tantovale-test-/);
	});

	it('creates a Mailpit transport without SMTP auth', () => {
		const transporter = createMailer(process);
		expect(transporter.options).toMatchObject({
			host: environment.SMTP_HOST,
			port: environment.SMTP_PORT,
			secure: false,
		});
	});
});
```

Run:

```bash
pnpm --filter @workspace/server exec vitest run test/infrastructure/local-services-config.test.ts --config vitest.config.ts
```

Expected: FAIL because the new environment fields and local endpoint support do not exist.

- [ ] **Step 2: Extend environment validation**

Add to `EnvSchema` in `apps/server/src/env.ts`:

```ts
AWS_ENDPOINT: z.url().optional(),
AWS_FORCE_PATH_STYLE: z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true'),
SMTP_FROM: z.string().default('Tantovale <noreply@tantovale.it>'),
```

- [ ] **Step 3: Configure the S3 client from environment**

Replace `apps/server/src/lib/s3client.ts` with:

```ts
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { environment } from '#utils/constants';

export const s3Client = new S3Client({
	region: environment.AWS_REGION,
	endpoint: environment.AWS_ENDPOINT,
	forcePathStyle: environment.AWS_FORCE_PATH_STYLE,
	credentials: {
		accessKeyId: environment.AWS_ACCESS_KEY,
		secretAccessKey: environment.AWS_SECRET_ACCESS_KEY,
	},
});

export async function getObjectUrl(key: string) {
	const command = new GetObjectCommand({
		Bucket: environment.AWS_BUCKET_NAME,
		Key: key,
	});
	return getSignedUrl(s3Client, command);
}
```

- [ ] **Step 4: Configure SMTP without forcing authentication**

Replace `createMailer` with:

```ts
import nodemailer from 'nodemailer';
import { parseEnv } from '../../env';

export function createMailer(process: NodeJS.Process) {
	const environment = parseEnv(process.env);
	const auth = environment.SMTP_USER ? { user: environment.SMTP_USER, pass: environment.SMTP_PASS } : undefined;

	return nodemailer.createTransport({
		host: environment.SMTP_HOST,
		port: environment.SMTP_PORT,
		secure: environment.SMTP_PORT === 465,
		auth,
	});
}
```

In both email template files, replace the `from` value with:

```ts
from: parseEnv(process.env).SMTP_FROM,
```

- [ ] **Step 5: Run configuration, lint, and typecheck**

```bash
pnpm --filter @workspace/server exec vitest run test/infrastructure/local-services-config.test.ts --config vitest.config.ts
pnpm --filter @workspace/server lint
pnpm --filter @workspace/server typecheck
```

Expected: all commands pass with zero warnings.

- [ ] **Step 6: Commit local boundary configuration**

```bash
git add apps/server/src/env.ts apps/server/src/lib/s3client.ts apps/server/src/mailer/lib/createMailer.ts apps/server/src/mailer/templates/verify-email.ts apps/server/src/mailer/templates/forgot-password-email.ts apps/server/test/infrastructure/local-services-config.test.ts
git commit -m "test(server): support local S3 and SMTP services"
```

## Task 6: Reset worker-owned database and object storage before each test

**Files:**

- Create: `apps/server/test/helpers/database.ts`
- Create: `apps/server/test/helpers/object-storage.ts`
- Create: `apps/server/test/setup.ts`
- Create: `apps/server/test/infrastructure/isolation.test.ts`
- Modify: `apps/server/vitest.config.ts`

- [ ] **Step 1: Implement guarded database reset**

Create `apps/server/test/helpers/database.ts`:

```ts
import { createClient } from '../../src/database';
import { assertDisposableDatabaseName } from '../infrastructure/runtime';

export function getTestDatabase() {
	assertDisposableDatabaseName(process.env.POSTGRES_DB ?? '');
	return createClient();
}

export async function resetDatabase(): Promise<void> {
	const { client } = getTestDatabase();
	const { rows } = await client.query<{ tablename: string }>(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '__drizzle_migrations__'
    ORDER BY tablename
  `);
	const tableNames = rows.map(({ tablename }) => `"${tablename.replaceAll('"', '""')}"`);

	if (tableNames.length > 0) {
		await client.query(`TRUNCATE TABLE ${tableNames.join(', ')} RESTART IDENTITY CASCADE`);
	}
}
```

- [ ] **Step 2: Implement worker-bucket cleanup**

Create `apps/server/test/helpers/object-storage.ts`:

```ts
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { environment } from '../../src/utils/constants';

export async function resetObjectStorage(): Promise<void> {
	const client = new S3Client({
		endpoint: environment.AWS_ENDPOINT,
		region: environment.AWS_REGION,
		forcePathStyle: environment.AWS_FORCE_PATH_STYLE,
		credentials: {
			accessKeyId: environment.AWS_ACCESS_KEY,
			secretAccessKey: environment.AWS_SECRET_ACCESS_KEY,
		},
	});
	const listed = await client.send(new ListObjectsV2Command({ Bucket: environment.AWS_BUCKET_NAME }));
	const objects = (listed.Contents ?? []).flatMap(({ Key }) => (Key ? [{ Key }] : []));

	if (objects.length > 0) {
		await client.send(
			new DeleteObjectsCommand({
				Bucket: environment.AWS_BUCKET_NAME,
				Delete: { Objects: objects },
			}),
		);
	}
	client.destroy();
}
```

- [ ] **Step 3: Assign worker resources before application imports**

Create `apps/server/test/setup.ts`:

```ts
import { beforeEach, inject } from 'vitest';
import { buildServerEnvironment, getWorkerIndex } from './infrastructure/runtime';

const runtime = inject('testRuntime');
const workerIndex = getWorkerIndex(process.env.VITEST_POOL_ID, runtime.workerCount);
const database = runtime.resourceNames.workerDatabases[workerIndex]!;
const bucket = runtime.resourceNames.workerBuckets[workerIndex]!;

Object.assign(process.env, buildServerEnvironment(runtime, database, bucket));
process.env.MAILPIT_API_URL = runtime.mailpit.apiUrl;

const { resetDatabase } = await import('./helpers/database');
const { resetObjectStorage } = await import('./helpers/object-storage');

beforeEach(async () => {
	await Promise.all([resetDatabase(), resetObjectStorage()]);
});
```

- [ ] **Step 4: Enable setup only after its file exists**

Add this property beside `globalSetup` in `apps/server/vitest.config.ts`:

```ts
setupFiles: ['./test/setup.ts'],
```

- [ ] **Step 5: Prove state does not leak between tests**

Create `apps/server/test/infrastructure/isolation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { users } from '../../src/database/schemas/users';
import { getTestDatabase } from '../helpers/database';

describe('database isolation', () => {
	it('writes only to the worker database', async () => {
		const { db } = getTestDatabase();
		await db.insert(users).values({
			username: 'isolation-user',
			email: 'isolation@tantovale.test',
			password: 'not-a-login-password',
		});
		expect(await db.select().from(users)).toHaveLength(1);
	});

	it('starts the next test with no user rows', async () => {
		const { db } = getTestDatabase();
		expect(await db.select().from(users)).toEqual([]);
	});
});
```

- [ ] **Step 6: Run the isolation proof repeatedly**

```bash
pnpm --filter @workspace/server exec vitest run test/infrastructure/isolation.test.ts --config vitest.config.ts --sequence.shuffle --sequence.seed=41
pnpm --filter @workspace/server exec vitest run test/infrastructure/isolation.test.ts --config vitest.config.ts --sequence.shuffle --sequence.seed=97
```

Expected: both runs pass; the second test never sees the first test's row.

- [ ] **Step 7: Commit reset hooks**

```bash
git add apps/server/vitest.config.ts apps/server/test/setup.ts apps/server/test/helpers/database.ts apps/server/test/helpers/object-storage.ts apps/server/test/infrastructure/isolation.test.ts
git commit -m "test(server): reset worker state per test"
```

## Task 7: Add request, cookie, email, and fixture helpers

**Files:**

- Create: `apps/server/test/helpers/request.ts`
- Create: `apps/server/test/helpers/mailpit.ts`
- Create: `apps/server/test/fixtures/factories.ts`
- Create: `apps/server/test/helpers/helpers.test.ts`

- [ ] **Step 1: Write helper behavior tests**

Create `apps/server/test/helpers/helpers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CookieJar } from './request';
import { extractTokenFromLink } from './mailpit';

describe('API test helpers', () => {
	it('updates a cookie jar from multiple Set-Cookie headers', () => {
		const jar = new CookieJar();
		jar.capture(['access_token=one; Path=/; HttpOnly', 'refresh_token=two; Path=/; HttpOnly']);
		expect(jar.header()).toBe('access_token=one; refresh_token=two');
		jar.capture(['access_token=; Max-Age=0; Path=/']);
		expect(jar.header()).toBe('refresh_token=two');
	});

	it('extracts a named token from an email link', () => {
		expect(extractTokenFromLink('Visit http://storefront.test/verify?token=abc.def', 'token')).toBe('abc.def');
	});
});
```

- [ ] **Step 2: Implement request and cookie helpers**

Create `apps/server/test/helpers/request.ts`:

```ts
export class CookieJar {
	private readonly cookies = new Map<string, string>();

	capture(setCookieHeaders: string[]): void {
		for (const header of setCookieHeaders) {
			const [pair, ...attributes] = header.split(';');
			const separator = pair!.indexOf('=');
			const name = pair!.slice(0, separator).trim();
			const value = pair!.slice(separator + 1).trim();
			const deleted = value === '' || attributes.some((value) => /^\s*max-age=0\s*$/i.test(value));
			if (deleted) this.cookies.delete(name);
			else this.cookies.set(name, value);
		}
	}

	header(): string {
		return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
	}
}

export function jsonRequest(method: string, body?: unknown, jar?: CookieJar): RequestInit {
	const cookie = jar?.header();
	return {
		method,
		headers: {
			'content-type': 'application/json',
			...(cookie ? { cookie } : {}),
		},
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	};
}

export function captureCookies(response: Response, jar: CookieJar): void {
	jar.capture(response.headers.getSetCookie());
}
```

- [ ] **Step 3: Implement recipient-scoped Mailpit polling**

Create `apps/server/test/helpers/mailpit.ts`:

```ts
type MailpitMessage = {
	ID: string;
	To: Array<{ Address: string }>;
	Subject: string;
};

type MailpitSearch = { messages: MailpitMessage[] };
type MailpitMessageDetail = { HTML: string; Text: string };

function apiUrl(): string {
	const value = process.env.MAILPIT_API_URL;
	const parsed = value ? new URL(value) : undefined;
	if (!parsed || parsed.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(parsed.hostname)) {
		throw new Error('Unsafe Mailpit API URL');
	}
	return parsed.origin;
}

export async function waitForEmail(recipient: string, subject: string): Promise<MailpitMessageDetail> {
	const deadline = Date.now() + 5_000;
	while (Date.now() < deadline) {
		const response = await fetch(`${apiUrl()}/api/v1/search?query=to:${encodeURIComponent(recipient)}`);
		const search = (await response.json()) as MailpitSearch;
		const message = search.messages.find(
			(candidate) => candidate.Subject === subject && candidate.To.some(({ Address }) => Address === recipient),
		);
		if (message) {
			const detail = await fetch(`${apiUrl()}/api/v1/message/${message.ID}`);
			return (await detail.json()) as MailpitMessageDetail;
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	throw new Error(`Email not received for ${recipient} with subject ${subject}`);
}

export function extractTokenFromLink(content: string, parameter: string): string {
	const url = content.match(/https?:\/\/[^\s"<>]+/)?.[0]?.replaceAll('&amp;', '&');
	if (!url) throw new Error('Email contains no HTTP link');
	const token = new URL(url).searchParams.get(parameter);
	if (!token) throw new Error(`Email link has no ${parameter} parameter`);
	return token;
}
```

- [ ] **Step 4: Add typed minimal factories**

Create `apps/server/test/fixtures/factories.ts`:

```ts
import { hashPassword } from '../../src/lib/password';
import { profiles, users } from '../../src/database/schemas/schema';
import { getTestDatabase } from '../helpers/database';

let sequence = 0;

export function uniqueValue(prefix: string): string {
	sequence += 1;
	return `${prefix}-${process.env.VITEST_POOL_ID ?? '1'}-${sequence}`;
}

export async function createUserFixture(overrides: Partial<typeof users.$inferInsert> = {}) {
	const { db } = getTestDatabase();
	const suffix = uniqueValue('user');
	const password = 'StrongPass123!';
	const [user] = await db
		.insert(users)
		.values({
			username: suffix,
			email: `${suffix}@tantovale.test`,
			password: await hashPassword(password),
			email_verified: true,
			...overrides,
		})
		.returning();
	if (!user) throw new Error('User fixture insert failed');

	const [profile] = await db
		.insert(profiles)
		.values({
			user_id: user.id,
			name: 'Test',
			surname: 'User',
			gender: 'female',
			privacy_policy: true,
			marketing_policy: false,
		})
		.returning();
	if (!profile) throw new Error('Profile fixture insert failed');

	return { user, profile, password };
}
```

- [ ] **Step 5: Run focused helpers and typecheck**

```bash
pnpm --filter @workspace/server exec vitest run test/helpers/helpers.test.ts --config vitest.config.ts
pnpm --filter @workspace/server typecheck
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 6: Commit reusable helpers**

```bash
git add apps/server/test/helpers/request.ts apps/server/test/helpers/mailpit.ts apps/server/test/helpers/helpers.test.ts apps/server/test/fixtures/factories.ts
git commit -m "test(server): add API test helpers"
```

## Task 8: Register every mounted route and prove exact parity

**Files:**

- Create: `apps/server/test/contracts/route-registry.ts`
- Create: `apps/server/test/contracts/route-parity.test.ts`

- [ ] **Step 1: Write the failing parity test**

Create `apps/server/test/contracts/route-parity.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { routeContracts } from './route-registry';

function mountedRoutes(): string[] {
	return [
		...new Set(
			app.routes.filter(({ method }) => method !== 'ALL').map(({ method, path }) => `${method.toUpperCase()} ${path}`),
		),
	].sort();
}

describe('mounted route inventory', () => {
	it('matches the explicit API contract registry', () => {
		const registered = routeContracts.map(({ method, path }) => `${method} ${path}`).sort();
		expect(registered).toHaveLength(63);
		expect(mountedRoutes()).toEqual(registered);
	});
});
```

Run:

```bash
pnpm --filter @workspace/server exec vitest run test/contracts/route-parity.test.ts --config vitest.config.ts
```

Expected: FAIL because the registry is absent.

- [ ] **Step 2: Create the typed contract registry**

Create `apps/server/test/contracts/route-registry.ts`:

```ts
export type RouteContract = {
	method: 'GET' | 'POST' | 'PUT';
	path: string;
	auth: 'public' | 'cookie' | 'cron-secret' | 'webhook-basic';
	suite: string;
};

export const routeContracts = [
	{ method: 'GET', path: '/', auth: 'public', suite: 'documentation' },
	{ method: 'GET', path: '/openapi', auth: 'public', suite: 'documentation' },
	{ method: 'GET', path: '/addresses/auth/addresses_profile', auth: 'cookie', suite: 'addresses' },
	{ method: 'GET', path: '/addresses/auth/default_address', auth: 'cookie', suite: 'addresses' },
	{ method: 'POST', path: '/addresses/auth/add_address_to_profile', auth: 'cookie', suite: 'addresses' },
	{ method: 'PUT', path: '/addresses/auth/hide_address_from_profile', auth: 'cookie', suite: 'addresses' },
	{ method: 'PUT', path: '/addresses/auth/update_address_to_profile', auth: 'cookie', suite: 'addresses' },
	{ method: 'GET', path: '/categories', auth: 'public', suite: 'catalog' },
	{ method: 'GET', path: '/chat/auth/rooms', auth: 'cookie', suite: 'chat' },
	{ method: 'GET', path: '/chat/auth/rooms/:roomId/messages', auth: 'cookie', suite: 'chat' },
	{ method: 'GET', path: '/chat/auth/rooms/id/:item_id', auth: 'cookie', suite: 'chat' },
	{ method: 'POST', path: '/chat/auth/rooms', auth: 'cookie', suite: 'chat' },
	{ method: 'POST', path: '/chat/auth/rooms/:roomId/messages', auth: 'cookie', suite: 'chat' },
	{ method: 'GET', path: '/cron/auth/expired-orders-check', auth: 'cron-secret', suite: 'cron' },
	{ method: 'GET', path: '/cron/auth/expired-proposals-check', auth: 'cron-secret', suite: 'cron' },
	{ method: 'GET', path: '/cron/auth/sync-transactions', auth: 'cron-secret', suite: 'cron' },
	{ method: 'GET', path: '/favorites/auth/check/:item_id', auth: 'cookie', suite: 'favorites' },
	{ method: 'POST', path: '/favorites/auth/handle', auth: 'cookie', suite: 'favorites' },
	{ method: 'GET', path: '/item/:id', auth: 'public', suite: 'items' },
	{ method: 'POST', path: '/item/auth/buy_now', auth: 'cookie', suite: 'items' },
	{ method: 'POST', path: '/item/auth/new', auth: 'cookie', suite: 'items' },
	{ method: 'POST', path: '/item/auth/publish_state', auth: 'cookie', suite: 'items' },
	{ method: 'POST', path: '/item/auth/user_delete_item', auth: 'cookie', suite: 'items' },
	{ method: 'PUT', path: '/item/auth/edit/:id', auth: 'cookie', suite: 'items' },
	{ method: 'GET', path: '/items/:username', auth: 'public', suite: 'items' },
	{ method: 'GET', path: '/items/auth/user/favorites', auth: 'cookie', suite: 'items' },
	{ method: 'POST', path: '/items/auth/user/selling_items', auth: 'cookie', suite: 'items' },
	{ method: 'GET', path: '/locations/search', auth: 'public', suite: 'catalog' },
	{ method: 'GET', path: '/locations/search_by_id/:locationType/:locationId', auth: 'public', suite: 'catalog' },
	{ method: 'POST', path: '/login', auth: 'public', suite: 'authentication' },
	{ method: 'POST', path: '/logout/auth', auth: 'cookie', suite: 'authentication' },
	{ method: 'GET', path: '/orders/auth/:id', auth: 'cookie', suite: 'orders' },
	{ method: 'GET', path: '/orders/auth/status/:status', auth: 'cookie', suite: 'orders' },
	{ method: 'GET', path: '/orders_proposals/auth/:id', auth: 'cookie', suite: 'proposals' },
	{ method: 'GET', path: '/orders_proposals/auth/by_item/:item_id', auth: 'cookie', suite: 'proposals' },
	{ method: 'POST', path: '/orders_proposals/auth/buyer_aborted_proposal', auth: 'cookie', suite: 'proposals' },
	{ method: 'POST', path: '/orders_proposals/auth/create', auth: 'cookie', suite: 'proposals' },
	{ method: 'PUT', path: '/orders_proposals/auth', auth: 'cookie', suite: 'proposals' },
	{ method: 'GET', path: '/password/auth/reset-verify-token', auth: 'cookie', suite: 'authentication' },
	{ method: 'POST', path: '/password/auth/reset', auth: 'cookie', suite: 'authentication' },
	{ method: 'POST', path: '/password/forgot-password', auth: 'public', suite: 'authentication' },
	{ method: 'POST', path: '/platforms_costs/auth/calculate_platform_costs', auth: 'cookie', suite: 'platform-costs' },
	{ method: 'GET', path: '/profile/auth', auth: 'cookie', suite: 'profiles' },
	{ method: 'GET', path: '/profile/auth/profile_active_address_id', auth: 'cookie', suite: 'profiles' },
	{ method: 'GET', path: '/profile/compact/:username', auth: 'public', suite: 'profiles' },
	{ method: 'PUT', path: '/profile/auth', auth: 'cookie', suite: 'profiles' },
	{ method: 'GET', path: '/properties/:id', auth: 'public', suite: 'catalog' },
	{ method: 'GET', path: '/properties/subcategory_properties/:id', auth: 'public', suite: 'catalog' },
	{ method: 'POST', path: '/refresh/auth', auth: 'cookie', suite: 'authentication' },
	{ method: 'GET', path: '/shipment_provider/auth/active_carriers', auth: 'cookie', suite: 'shipping' },
	{ method: 'POST', path: '/shipment_provider/auth/calculate_shipment_cost', auth: 'cookie', suite: 'shipping' },
	{ method: 'POST', path: '/shipment_provider/auth/create_label', auth: 'cookie', suite: 'shipping' },
	{ method: 'POST', path: '/signup', auth: 'public', suite: 'authentication' },
	{ method: 'GET', path: '/subcategories', auth: 'public', suite: 'catalog' },
	{ method: 'GET', path: '/subcategories/:id', auth: 'public', suite: 'catalog' },
	{ method: 'GET', path: '/subcategories/no_parent/:id', auth: 'public', suite: 'catalog' },
	{ method: 'GET', path: '/subcategory_properties/:id', auth: 'public', suite: 'catalog' },
	{ method: 'GET', path: '/subcategory_properties/filter/:id', auth: 'public', suite: 'catalog' },
	{ method: 'POST', path: '/uploads/auth/images-item', auth: 'cookie', suite: 'uploads' },
	{ method: 'GET', path: '/user/auth', auth: 'cookie', suite: 'authentication' },
	{ method: 'GET', path: '/verify', auth: 'public', suite: 'authentication' },
	{ method: 'GET', path: '/verify/email', auth: 'public', suite: 'authentication' },
	{ method: 'POST', path: '/webhooks/trustap/transaction-update', auth: 'webhook-basic', suite: 'webhooks' },
] as const satisfies readonly RouteContract[];
```

- [ ] **Step 3: Run parity twice with different seeds**

```bash
pnpm --filter @workspace/server exec vitest run test/contracts/route-parity.test.ts --config vitest.config.ts --sequence.seed=11
pnpm --filter @workspace/server exec vitest run test/contracts/route-parity.test.ts --config vitest.config.ts --sequence.seed=29
```

Expected: PASS with exactly 63 unique method/path pairs.

- [ ] **Step 4: Commit the executable inventory**

```bash
git add apps/server/test/contracts/route-registry.ts apps/server/test/contracts/route-parity.test.ts
git commit -m "test(server): register mounted API routes"
```

## Task 9: Exercise the documentation endpoints in process

**Files:**

- Create: `apps/server/test/routes/documentation.test.ts`

- [ ] **Step 1: Write documentation endpoint tests**

Create `apps/server/test/routes/documentation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { app } from '../../src/app';

describe('documentation routes', () => {
	it('serves Scalar at the root', async () => {
		const response = await app.request('http://localhost/');
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('text/html');
		expect(html).toContain('/openapi');
	});

	it('serves a parseable OpenAPI document', async () => {
		const response = await app.request('http://localhost/openapi');
		const document = (await response.json()) as { openapi: string; info: { title: string } };

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('application/json');
		expect(document.openapi).toMatch(/^3\./);
		expect(document.info.title).toBe('Tantovale Honojs');
	});
});
```

- [ ] **Step 2: Run the first route suite**

```bash
pnpm --filter @workspace/server exec vitest run test/routes/documentation.test.ts --config vitest.config.ts
```

Expected: PASS with two in-process HTTP tests and no TCP listener for the Hono application.

- [ ] **Step 3: Run the complete foundation gate**

```bash
pnpm --filter @workspace/server test:api
pnpm --filter @workspace/server lint
pnpm --filter @workspace/server typecheck
pnpm --filter @workspace/server build
```

Expected: all foundation tests pass, lint has zero warnings, typecheck passes, and production build excludes tests.

- [ ] **Step 4: Commit the foundation smoke test**

```bash
git add apps/server/test/routes/documentation.test.ts
git commit -m "test(server): verify documentation routes"
```

## Foundation completion criteria

- `pnpm --filter @workspace/server test:api` starts and stops all three containers automatically.
- Migration runs once against a disposable template and every worker receives a cloned database.
- Every test begins with an empty worker database and bucket.
- The development database name is rejected by destructive helpers.
- Mailpit is reachable without external SMTP credentials.
- The application uses MinIO through environment configuration without changing production defaults.
- The mounted Hono inventory and registry both contain the same 63 routes.
- The production build contains no test files.
- Lint, typecheck, build, and the foundation suite pass with zero warnings.
