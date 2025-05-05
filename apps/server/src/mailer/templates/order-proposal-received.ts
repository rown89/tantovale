import { createMailer } from '../lib/createMailer';

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

	await transporter.sendMail({
		from: `"Tantovale" <${process.env.SMTP_USER}>`,
		to,
		subject: `Tantovale - Proposal received from ${buyer_username}`,
		html: `
      <div>
        <p>Proposal from ${buyer_username} for the object ${itemName}:</p>
        <p>${message}</p>
        <br>
        <a href="${process.env.STOREFRONT_HOSTNAME}/auth/chat/${roomId}">Go to the chat</a>
      </div>
    `,
	});
}
