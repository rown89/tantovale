import { createMailer } from '../../../lib/createMailer';
import { parseEnv } from '../../../../env';

export async function sendOrderPaidNotificationBuyer({
	to,
	orderId,
	roomId,
}: {
	to: string;
	orderId: number;
	roomId: number;
}) {
	const transporter = createMailer(process);

	await transporter.sendMail({
		from: `"Tantovale" <${parseEnv(process.env).SMTP_USER}>`,
		to,
		subject: `Tantovale - Order #${orderId} paid`,
		html: `
      <div>
        <p>Order #${orderId} has been paid.</p>
				<p>Wait for the seller to ship the item.</p>
        <br>
        <p>If you have any questions, please contact the seller.</p>
        <a href="${parseEnv(process.env).STOREFRONT_HOSTNAME}/auth/chat/${roomId}">Go to the chat</a>
        <br>
				<p>Thank you for your purchase!</p>
        </div>
    `,
	});
}
