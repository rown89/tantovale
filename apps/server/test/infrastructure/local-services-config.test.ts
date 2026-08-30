import { describe, expect, inject, it, vi } from 'vitest';

import { buildServerEnvironment } from './runtime';

describe('local service configuration', () => {
	it('configures S3 and SMTP adapters from the disposable test runtime', async () => {
		const runtime = inject('testRuntime');
		const database = runtime.resourceNames.workerDatabases.at(0);
		const bucket = runtime.resourceNames.workerBuckets.at(0);

		if (!database || !bucket) {
			throw new Error('The test runtime must provide a worker database and bucket');
		}

		const testEnvironment = buildServerEnvironment(runtime, database, bucket);
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
			delete fallbackEnvironment.SMTP_FROM;
			const parsedFallbackEnvironment = parseEnv(fallbackEnvironment);
			expect(parsedFallbackEnvironment.AWS_ENDPOINT).toBeUndefined();
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
				SMTP_FROM: 'Tantovale <noreply@tantovale.test>',
			});
			expect(new URL(environment.AWS_ENDPOINT!).hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
			expect(environment.AWS_BUCKET_NAME).toMatch(/^tantovale-test-/);

			const objectUrl = new URL(await getObjectUrl('uploads/avatar.png'));
			expect(objectUrl.origin).toBe(runtime.minio.endpoint);
			expect(objectUrl.pathname).toBe(`/${bucket}/uploads/avatar.png`);

			transporter = createMailer(process);
			const options = transporter.options;
			expect(options).toMatchObject({
				host: runtime.mailpit.smtpHost,
				port: runtime.mailpit.smtpPort,
				secure: false,
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
