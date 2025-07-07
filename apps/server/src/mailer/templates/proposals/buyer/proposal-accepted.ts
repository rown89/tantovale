import { createMailer } from '../../../lib/createMailer';
import { parseEnv } from '../../../../env';

export async function sendProposalAcceptedMessage({
	to,
	merchant_username,
	itemName,
}: {
	to: string;
	merchant_username: string;
	itemName: string;
}) {
	const transporter = createMailer(process);

	const days = parseEnv(process.env).ORDERS_PAYMENT_HANDLING_TOLLERANCE_IN_HOURS / 24;

	await transporter.sendMail({
		from: `"Tantovale" <${parseEnv(process.env).SMTP_USER}>`,
		to,
		subject: `Tantovale - Proposal accepted`,
		html: `
      <div>
        <p>${merchant_username} has accepted your proposal for the item ${itemName}</p>
        <br>
			  <p>You have ${days} days to complete the payment, if you don't complete the payment, the order will be automatically cancelled.</p>
        <a href="${parseEnv(process.env).STOREFRONT_HOSTNAME}/auth/orders">Go to the orders</a>     
        <br>
				<p>Thank you for using Tantovale!</p>
      </div>
    `,
	});
}
