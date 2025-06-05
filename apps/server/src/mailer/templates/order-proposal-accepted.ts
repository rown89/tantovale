import { createMailer } from '../lib/createMailer';
import { parseEnv } from '../../env';

export async function sendProposalAcceptedMessage({
	to,
	roomId,
	merchant_username,
	itemName,
}: {
	to: string;
	roomId: number;
	merchant_username: string;
	itemName: string;
}) {
	const transporter = createMailer(process);

	await transporter.sendMail({
		from: `"Tantovale" <${parseEnv(process.env).SMTP_USER}>`,
		to,
		subject: `Tantovale - Proposal accepted`,
		html: `
      <div>
        <p>${merchant_username} has accepted your proposal for the object ${itemName}</p>
        <br>
        <a href="${parseEnv(process.env).STOREFRONT_HOSTNAME}/auth/chat/${roomId}">Go to the chat</a>
      </div>
    `,
	});
}
