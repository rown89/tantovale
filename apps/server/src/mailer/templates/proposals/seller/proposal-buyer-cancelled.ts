import { createMailer } from '../../../lib/createMailer';
import { parseEnv } from '../../../../env';

export async function sendProposalCancelledMessage({
	to,
	proposal_id,
	buyer_username,
	itemName,
}: {
	to: string;
	proposal_id: number;
	buyer_username: string;
	itemName: string;
}) {
	const transporter = createMailer(process);

	await transporter.sendMail({
		from: `"Tantovale" <${parseEnv(process.env).SMTP_USER}>`,
		to,
		subject: `Tantovale - Proposal #${proposal_id} cancelled`,
		html: `
      <div>
        <p>Proposal #${proposal_id} has been cancelled by ${buyer_username} for the object ${itemName}</p>
        <br>
      </div>
    `,
	});
}
