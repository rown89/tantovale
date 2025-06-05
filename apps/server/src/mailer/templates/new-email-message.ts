import { createMailer } from '../lib/createMailer';
import { parseEnv } from '../../env';

export async function sendNewMessageWarning({
	to,
	roomId,
	username,
	message,
}: {
	to: string;
	roomId: number;
	username: string;
	message: string;
}) {
	const transporter = createMailer(process);

	await transporter.sendMail({
		from: `"Tantovale" <${parseEnv(process.env).SMTP_USER}>`,
		to,
		subject: 'Tantovale - New message received',
		html: `
      <div>
        <p>Message from: ${username}:</p>
        <p>${message}</p>
        <br>
        <a href="${parseEnv(process.env).STOREFRONT_HOSTNAME}/auth/chat/${roomId}">Go to the chat</a>
      </div>
    `,
	});
}
