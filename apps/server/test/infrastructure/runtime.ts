import { PROVIDER_TEST_CREDENTIALS } from './provider-stubs';

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
	providers: {
		trustapUrls: string[];
		shippoUrls: string[];
	};
};

const disposableDatabaseName = /^tantovale_test_[a-z0-9]+_(template|worker_[1-9][0-9]*)$/;
const testRunId = /^[a-z0-9]+$/;

function assertValidRunId(runId: string): void {
	if (!testRunId.test(runId)) {
		throw new Error('Invalid test resource namespace: runId must be nonempty lowercase alphanumeric');
	}
}

function assertValidWorkerCount(workerCount: number): void {
	if (!Number.isSafeInteger(workerCount) || workerCount < 1) {
		throw new Error('Invalid test resource namespace: workerCount must be a positive safe integer');
	}
}

export function assertDisposableDatabaseName(name: string): void {
	if (!disposableDatabaseName.test(name)) {
		throw new Error(`Refusing destructive operation: ${name || '<empty>'} is not a disposable test database`);
	}
}

export function createResourceNames(runId: string, workerCount: number): ResourceNames {
	assertValidRunId(runId);
	assertValidWorkerCount(workerCount);

	const workers = Array.from({ length: workerCount }, (_, index) => index + 1);

	return {
		templateDatabase: `tantovale_test_${runId}_template`,
		workerDatabases: workers.map((worker) => `tantovale_test_${runId}_worker_${worker}`),
		workerBuckets: workers.map((worker) => `tantovale-test-${runId}-worker-${worker}`),
	};
}

export function getWorkerIndex(workerId: string | undefined, workerCount: number): number {
	assertValidWorkerCount(workerCount);

	const value = workerId ?? '1';
	const worker = Number(value);

	if (!Number.isInteger(worker) || worker < 1 || worker > workerCount) {
		throw new Error(`Invalid Vitest worker id: ${workerId ?? '<missing>'}`);
	}

	return worker - 1;
}

export function buildServerEnvironment(
	runtime: TestRuntime,
	database: string,
	bucket: string,
	workerIndex: number,
): NodeJS.ProcessEnv {
	assertDisposableDatabaseName(database);
	const trustapUrl = runtime.providers.trustapUrls[workerIndex];
	const shippoUrl = runtime.providers.shippoUrls[workerIndex];

	if (!trustapUrl || !shippoUrl) {
		throw new Error(`No commerce provider stub pair was assigned to worker index ${workerIndex}`);
	}

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
		PAYMENT_PROVIDER_API_URL: trustapUrl,
		PAYMENT_PROVIDER_API_VERSION: 'api/v1',
		PAYMENT_PROVIDER_API_KEY: PROVIDER_TEST_CREDENTIALS.trustapApiKey,
		PAYMENT_PROVIDER_CLIENT_ID: 'trustap-test-client',
		PAYMENT_PROVIDER_CLIENT_SECRET: 'trustap-test-client-secret',
		PAYMENT_PROVIDER_WEBHOOK_SECRET: 'trustap-webhook-test-secret',
		PAYMENT_PROVIDER_PAY_PAGE_URL: 'http://trustap.test/pay',
		POST_PAYMENT_REDIRECT_URL: 'http://storefront.test',
		SHIPPING_PROVIDER_API_KEY: PROVIDER_TEST_CREDENTIALS.shippoApiKey,
		SHIPPING_PROVIDER_WEBHOOK_SECRET: 'shippo-webhook-test-secret',
		SHIPPING_PROVIDER_API_URL: shippoUrl,
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
