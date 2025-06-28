import { createMailer } from '../lib/createMailer';
import { parseEnv } from '../../env';

export async function sendProposalRejectedMessage({
	to,
	roomId,
	itemName,
	merchant_username,
}: {
	to: string;
	roomId: number;
	itemName: string;
	merchant_username: string;
}) {
	const transporter = createMailer(process);

	await transporter.sendMail({
		from: `"Tantovale" <${parseEnv(process.env).SMTP_USER}>`,
		to,
		subject: `Tantovale - Proposal rejected`,
		html: `
      <div>
        <p>${merchant_username} has rejected your proposal for the item ${itemName}</p>
        <br>
        <a href="${parseEnv(process.env).STOREFRONT_HOSTNAME}/auth/chat/${roomId}">Go to the chat</a>
        <br>
        <p>Thank you for using Tantovale!</p>
      </div>
    `,
	});
}
