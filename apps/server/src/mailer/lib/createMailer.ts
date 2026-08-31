import nodemailer from 'nodemailer';
import { parseEnv } from '../../env';

export function createMailer(process: NodeJS.Process) {
	const environment = parseEnv(process.env);
	const auth = environment.SMTP_USER
		? {
				auth: {
					user: environment.SMTP_USER,
					pass: environment.SMTP_PASS,
				},
			}
		: {};

	return nodemailer.createTransport({
		host: environment.SMTP_HOST,
		port: environment.SMTP_PORT,
		secure: environment.SMTP_PORT === 465,
		connectionTimeout: environment.SMTP_REQUEST_TIMEOUT_MS,
		greetingTimeout: environment.SMTP_REQUEST_TIMEOUT_MS,
		socketTimeout: environment.SMTP_REQUEST_TIMEOUT_MS,
		...auth,
	});
}
