import { createMailer } from '../lib/createMailer';

export async function sendProposalRejectedMessage({
	to,
	roomId,
	itemName,
	username,
}: {
	to: string;
	roomId: number;
	itemName: string;
	username: string;
}) {
	const transporter = createMailer(process);

	await transporter.sendMail({
		from: `"Tantovale" <${process.env.SMTP_USER}>`,
		to,
		subject: `Tantovale - Proposal rejected`,
		html: `
      <div>
        <p>${username} has rejected your proposal for the object ${itemName}</p>
        <br>
        <a href="${process.env.STOREFRONT_HOSTNAME}/auth/chat/${roomId}">Go to the chat</a>
      </div>
    `,
	});
}
