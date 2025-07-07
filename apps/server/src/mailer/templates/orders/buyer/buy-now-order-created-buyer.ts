import { createMailer } from '../../../lib/createMailer';
import { parseEnv } from '../../../../env';

export async function sendBuyNowOrderCreatedBuyer({
	to,
	roomId,
	seller_username,
	itemName,
}: {
	to: string;
	roomId: number;
	seller_username: string;
	itemName: string;
}) {
	const transporter = createMailer(process);

	const days = parseEnv(process.env).ORDERS_PAYMENT_HANDLING_TOLLERANCE_IN_HOURS / 24;

	await transporter.sendMail({
		from: `"Tantovale" <${parseEnv(process.env).SMTP_USER}>`,
		to,
		subject: `Tantovale - Order created for ${itemName}`,
		html: `
      <div>
        <p>Order created for ${itemName} acquired from ${seller_username}:</p>
        <br>
				<p>You have ${days} days to complete the payment:</p>
        <a href="${parseEnv(process.env).STOREFRONT_HOSTNAME}/auth/profile/orders">Go to the orders</a>
        <br>
        <p>If you have any questions, please contact the seller:</p>
        <a href="${parseEnv(process.env).STOREFRONT_HOSTNAME}/auth/chat/${roomId}">Go to the chat</a>
      </div>
    `,
	});
}
