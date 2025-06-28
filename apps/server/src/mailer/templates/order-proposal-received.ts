import { createMailer } from '../lib/createMailer';
import { parseEnv } from '../../env';

export async function sendNewProposalMessage({
	to,
	roomId,
	buyer_username,
	itemName,
	message,
}: {
	to: string;
	roomId: number;
	buyer_username: string;
	itemName: string;
	message: string;
}) {
	const transporter = createMailer(process);

	const days = parseEnv(process.env).PROPOSALS_HANDLING_TOLLERANCE_IN_HOURS / 24;

	await transporter.sendMail({
		from: `"Tantovale" <${parseEnv(process.env).SMTP_USER}>`,
		to,
		subject: `Tantovale - Proposal received from ${buyer_username}`,
		html: `
      <div>
        <p>Proposal from ${buyer_username} for the object ${itemName}:</p>
        <p>${message}</p>
        <br>
				<p>You have ${days} days to accept or reject the proposal in the chat:</p>
        <a href="${parseEnv(process.env).STOREFRONT_HOSTNAME}/auth/chat/${roomId}">Go to the chat</a>
      </div>
    `,
	});
}
