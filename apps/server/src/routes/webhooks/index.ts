import { eq } from 'drizzle-orm';
import Stripe from 'stripe';
import { createRouter } from 'src/lib/create-app';
import { parseEnv } from 'src/env';
import { streamToBuffer } from 'src/utils/stream-to-buffer';
import { createClient } from 'src/database';
import { transactions } from 'src/database/schemas/transactions';

const stripe = new Stripe(parseEnv(process.env).STRIPE_SECRET_KEY, {
	apiVersion: '2023-08-16',
});

const endpointSecret = parseEnv(process.env).STRIPE_WEBHOOK_SECRET;

export const webhooksRoute = createRouter().post('/stripe', async (c) => {
	const reqRaw = c.req.raw;
	const sig = c.req.header('stripe-signature');

	const bodyBuffer = await streamToBuffer(reqRaw.body!);

	let event: Stripe.Event;

	try {
		event = stripe.webhooks.constructEvent(bodyBuffer, sig!, endpointSecret);
	} catch (err) {
		console.error('Webhook signature error:', err);

		return c.text('Webhook Error', 400);
	}

	if (event.type === 'payment_intent.succeeded') {
		const intent = event.data.object as Stripe.PaymentIntent;
		console.log('✅ Pagamento riuscito:', intent.id);

		const { db } = createClient();

		await db
			.update(transactions)
			.set({
				payment_status: 'waiting_confirmation',
			})
			.where(eq(transactions.stripePaymentIntentId, intent.id));

		return c.text('ok', 200);
	}

	return c.text('ok', 200);
});
