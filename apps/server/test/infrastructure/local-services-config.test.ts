import { describe, expect, inject, it, vi } from 'vitest';

import { getProviderRequests } from '../helpers/providers';
import { buildServerEnvironment, getWorkerIndex, type TestRuntime } from './runtime';

function resolveWorkerAssignment(runtime: TestRuntime, workerId: string | undefined) {
	const workerIndex = getWorkerIndex(workerId, runtime.workerCount);
	const database = runtime.resourceNames.workerDatabases[workerIndex];
	const bucket = runtime.resourceNames.workerBuckets[workerIndex];
	const trustapUrl = runtime.providers.trustapUrls[workerIndex];
	const shippoUrl = runtime.providers.shippoUrls[workerIndex];

	if (!database || !bucket || !trustapUrl || !shippoUrl) {
		throw new Error(`The test runtime must provide every resource for worker index ${workerIndex}`);
	}

	return { workerIndex, database, bucket, trustapUrl, shippoUrl };
}

describe('local service configuration', () => {
	it('selects every matching resource for a nonzero synthetic Vitest worker', () => {
		const runtime = inject('testRuntime');
		const assignment = resolveWorkerAssignment(runtime, '3');

		expect(assignment).toEqual({
			workerIndex: 2,
			database: runtime.resourceNames.workerDatabases[2],
			bucket: runtime.resourceNames.workerBuckets[2],
			trustapUrl: runtime.providers.trustapUrls[2],
			shippoUrl: runtime.providers.shippoUrls[2],
		});
	});

	it('configures S3 and SMTP adapters from the disposable test runtime', async () => {
		const runtime = inject('testRuntime');
		/* eslint-disable-next-line turbo/no-undeclared-env-vars -- Vitest provides this identifier for each isolated worker process. */
		const workerId = process.env.VITEST_POOL_ID;
		const { workerIndex, database, bucket, trustapUrl, shippoUrl } = resolveWorkerAssignment(runtime, workerId);
		const testEnvironment = buildServerEnvironment(runtime, database, bucket, workerIndex);
		const originalEnvironment = new Map(Object.keys(testEnvironment).map((key) => [key, process.env[key]]));
		let transporter: { close: () => void; options: unknown } | undefined;
		let authenticatedTransporter: { close: () => void; options: unknown } | undefined;
		let restoreCreateTransport: (() => void) | undefined;

		try {
			Object.assign(process.env, testEnvironment);
			vi.resetModules();

			const { parseEnv } = await import('../../src/env');
			const { environment } = await import('../../src/utils/constants');
			const { getObjectUrl } = await import('../../src/lib/s3client');
			const { createMailer } = await import('../../src/mailer/lib/createMailer');

			const fallbackEnvironment: NodeJS.ProcessEnv = {
				...testEnvironment,
				SMTP_USER: 'legacy-sender@example.test',
				SMTP_PASS: 'legacy-password',
			};
			delete fallbackEnvironment.AWS_ENDPOINT;
			delete fallbackEnvironment.AWS_FORCE_PATH_STYLE;
			delete fallbackEnvironment.SHIPPING_PROVIDER_API_URL;
			delete fallbackEnvironment.SMTP_FROM;
			const parsedFallbackEnvironment = parseEnv(fallbackEnvironment);
			expect(parsedFallbackEnvironment.AWS_ENDPOINT).toBeUndefined();
			expect(parsedFallbackEnvironment.SHIPPING_PROVIDER_API_URL).toBeUndefined();
			expect(parsedFallbackEnvironment).toMatchObject({
				AWS_FORCE_PATH_STYLE: false,
				SMTP_FROM: '"Tantovale" <legacy-sender@example.test>',
			});
			expect(
				parseEnv({
					...testEnvironment,
					SMTP_FROM: 'Custom sender <custom@example.test>',
				}),
			).toMatchObject({ SMTP_FROM: 'Custom sender <custom@example.test>' });

			expect(environment).toMatchObject({
				AWS_ENDPOINT: runtime.minio.endpoint,
				AWS_FORCE_PATH_STYLE: true,
				AWS_BUCKET_NAME: bucket,
				POSTGRES_DB: database,
				PAYMENT_PROVIDER_API_URL: trustapUrl,
				SHIPPING_PROVIDER_API_URL: shippoUrl,
				SMTP_FROM: 'Tantovale <noreply@tantovale.test>',
			});
			expect(new URL(environment.AWS_ENDPOINT!).hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
			expect(environment.AWS_BUCKET_NAME).toMatch(/^tantovale-test-/);

			const { carrierAccountsList } = await import('shippo/funcs/carrierAccountsList.js');
			const { shippoClient } = await import('../../src/lib/shippo-client');
			const carrierAccounts = await carrierAccountsList(shippoClient, { page: 1, results: 25 });
			expect(carrierAccounts.ok).toBe(true);
			const shippoRequests = await getProviderRequests(shippoUrl);
			expect(shippoRequests).toHaveLength(1);
			expect(shippoRequests[0]).toMatchObject({
				method: 'GET',
				path: '/carrier_accounts?page=1&results=25',
				headers: {
					authorization: `ShippoToken ${environment.SHIPPING_PROVIDER_API_KEY}`,
					'shippo-api-version': '2018-02-08',
				},
			});

			const objectUrl = new URL(await getObjectUrl('uploads/avatar.png'));
			expect(objectUrl.origin).toBe(runtime.minio.endpoint);
			expect(objectUrl.pathname).toBe(`/${bucket}/uploads/avatar.png`);

			transporter = createMailer(process);
			const options = transporter.options;
			expect(options).toMatchObject({
				host: runtime.mailpit.smtpHost,
				port: runtime.mailpit.smtpPort,
				secure: false,
				connectionTimeout: 150,
				greetingTimeout: 150,
				socketTimeout: 150,
			});
			expect(options).not.toHaveProperty('auth');

			const authenticatedEnvironment = {
				...testEnvironment,
				SMTP_PORT: '465',
				SMTP_USER: 'authenticated-user',
				SMTP_PASS: 'authenticated-password',
			};
			const authenticatedProcess = Object.create(process) as NodeJS.Process;
			authenticatedProcess.env = authenticatedEnvironment;
			authenticatedTransporter = createMailer(authenticatedProcess);
			expect(authenticatedTransporter.options).toMatchObject({
				secure: true,
				auth: {
					user: 'authenticated-user',
					pass: 'authenticated-password',
				},
			});

			const nodemailer = await import('nodemailer');
			const sendMail = vi.fn().mockResolvedValue({});
			const createTransport = vi.spyOn(nodemailer.default, 'createTransport').mockReturnValue({ sendMail } as never);
			restoreCreateTransport = () => createTransport.mockRestore();
			const { sendVerifyEmail } = await import('../../src/mailer/templates/verify-email');
			const { sendForgotPasswordEmail } = await import('../../src/mailer/templates/forgot-password-email');

			await sendVerifyEmail('verify@example.test', 'http://storefront.test/verify');
			await sendForgotPasswordEmail('reset@example.test', 'http://storefront.test/reset');

			expect(sendMail).toHaveBeenNthCalledWith(
				1,
				expect.objectContaining({ from: environment.SMTP_FROM, to: 'verify@example.test' }),
			);
			expect(sendMail).toHaveBeenNthCalledWith(
				2,
				expect.objectContaining({ from: environment.SMTP_FROM, to: 'reset@example.test' }),
			);
		} finally {
			restoreCreateTransport?.();
			transporter?.close();
			authenticatedTransporter?.close();
			for (const [key, value] of originalEnvironment) {
				if (value === undefined) {
					delete process.env[key];
				} else {
					process.env[key] = value;
				}
			}
			vi.resetModules();
		}
	});
});
