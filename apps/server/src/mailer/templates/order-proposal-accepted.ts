import { createMailer } from '../lib/createMailer';

export async function sendProposalAcceptedMessage({
	to,
	roomId,
	username,
	itemName,
}: {
	to: string;
	roomId: number;
	username: string;
	itemName: string;
}) {
	const transporter = createMailer(process);

	await transporter.sendMail({
		from: `"Tantovale" <${process.env.SMTP_USER}>`,
		to,
		subject: `Tantovale - Proposal accepted`,
		html: `
      <div>
        <p>${username} has accepted your proposal for the object ${itemName}</p>
        <br>
        <a href="${process.env.STOREFRONT_HOSTNAME}/auth/chat/${roomId}">Go to the chat</a>
      </div>
    `,
	});
}
