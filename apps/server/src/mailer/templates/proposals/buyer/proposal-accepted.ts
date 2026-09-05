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

export async function sendProposalAcceptedMessage({
	to,
	merchant_username,
	itemName,
	orderId,
	paymentUrl,
}: {
	to: string;
	merchant_username: string;
	itemName: string;
	orderId: number;
	paymentUrl: string;
}) {
	const transporter = createMailer(process);
	const environment = parseEnv(process.env);
	const days = environment.ORDERS_PAYMENT_HANDLING_TOLLERANCE_IN_HOURS / 24;
	const ordersUrl = new URL('/auth/profile/orders', environment.STOREFRONT_HOSTNAME);
	ordersUrl.searchParams.set('highlight', String(orderId));

	await transporter.sendMail({
		from: `"Tantovale" <${environment.SMTP_USER}>`,
		to,
		subject: `Tantovale - Proposal accepted`,
		html: `
      <div>
		<p>${escapeHtml(merchant_username)} has accepted your proposal for the item ${escapeHtml(itemName)}</p>
        <br>
			  <p>You have ${days} days to complete the payment, if you don't complete the payment, the order will be automatically cancelled.</p>
		<a href="${escapeHtml(paymentUrl)}">Complete the payment</a>
		<br>
		<a href="${escapeHtml(ordersUrl.toString())}">Go to the orders</a>
        <br>
				<p>Thank you for using Tantovale!</p>
      </div>
    `,
	});
}
