import { createMailer } from '../../../lib/createMailer';
import { parseEnv } from '../../../../env';

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#039;');
}

export async function sendNewProposalMessageSeller({
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
	const safeBuyerUsername = escapeHtml(buyer_username);
	const safeItemName = escapeHtml(itemName);
	const safeMessage = escapeHtml(message);

	await transporter.sendMail({
		from: `"Tantovale" <${parseEnv(process.env).SMTP_USER}>`,
		to,
		subject: `Tantovale - Proposal received from ${buyer_username}`,
		html: `
      <div>
		<p>Proposal from ${safeBuyerUsername} for the object ${safeItemName}:</p>
		<p>${safeMessage}</p>
        <br>
				<p>You have ${days} days to accept or reject the proposal in the chat:</p>
        <a href="${parseEnv(process.env).STOREFRONT_HOSTNAME}/auth/chat/${roomId}">Go to the chat</a>
      </div>
    `,
	});
}
