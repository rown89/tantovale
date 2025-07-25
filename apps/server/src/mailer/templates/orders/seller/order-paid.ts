import { createMailer } from '../../../lib/createMailer';
import { parseEnv } from '../../../../env';

export async function sendOrderPaidNotificationSeller({
	to,
	item_name,
	roomId,
	buyer_name,
	labelUrl,
}: {
	to: string;
	item_name: string;
	roomId: number;
	buyer_name: string;
	labelUrl?: string;
}) {
	const transporter = createMailer(process);

	await transporter.sendMail({
		from: `"Tantovale" <${parseEnv(process.env).SMTP_USER}>`,
		to,
		subject: `Tantovale - ${item_name} paid`,
		html: `
      <div>
        <p>${item_name} has been paid by the user ${buyer_name}.</p>
				<p>You can download the shipping label in PDF format <a href="${labelUrl}">here</a>.</p>
				<p>You can also find the shipping label in your profile:</p>
				<a href="${parseEnv(process.env).STOREFRONT_HOSTNAME}/auth/profile/orders">Go to the orders</a>
        <br>
				<p>You need to print the shipping label and attach it to the package, go to a Poste Italiane <a href="https://www.poste.it/cerca-mappe-app/?vieni-in-poste">point</a>, and operator will scan the label to send the package.</p>
        <br>
        <p>If you need to contact the buyer about the shipping details or any other details, <a href="${parseEnv(process.env).STOREFRONT_HOSTNAME}/auth/chat/${roomId}">go to the chat</a></p>
        <br>
				<p>Thank you for your sale!</p>
				<p>Tantovale</p>
        </div>
    `,
	});
}
