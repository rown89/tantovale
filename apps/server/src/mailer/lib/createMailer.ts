import nodemailer from 'nodemailer';
import { parseEnv } from 'src/env';

export function createMailer(process: NodeJS.Process) {
	return nodemailer.createTransport({
		host: parseEnv(process.env).SMTP_HOST,
		port: parseEnv(process.env).SMTP_PORT,
		auth: {
			user: parseEnv(process.env).SMTP_USER,
			pass: parseEnv(process.env).SMTP_PASS,
		},
	});
}
