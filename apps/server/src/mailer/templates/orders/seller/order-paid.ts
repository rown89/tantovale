import { createMailer } from '../../../lib/createMailer';
import { parseEnv } from '../../../../env';

export async function sendOrderPaidNotificationSeller({
	to,
	item_name,
	roomId,
	buyer_name,
}: {
	to: string;
	item_name: string;
	roomId: number;
	buyer_name: string;
}) {
	const transporter = createMailer(process);

	await transporter.sendMail({
		from: `"Tantovale" <${parseEnv(process.env).SMTP_USER}>`,
		to,
		subject: `Tantovale - ${item_name} paid`,
		html: `
      <div>
        <p>${item_name} has been paid by the user ${buyer_name}.</p>
        <p>You can now ship the item.</p>
        <br>
        <p>Find your selled orders in your profile:</p>
        <a href="${parseEnv(process.env).STOREFRONT_HOSTNAME}/auth/profile/orders">Go to the orders</a>
        <br>
        <p>If you need to contact the buyer about the shipping details or any other details:</p>
        <a href="${parseEnv(process.env).STOREFRONT_HOSTNAME}/auth/chat/${roomId}">Go to the chat</a>
        <br>
				<p>Thank you for your sale!</p>
        </div>
    `,
	});
}
