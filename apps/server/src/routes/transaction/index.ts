import { eq } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import Stripe from 'stripe';
import { z } from 'zod';

import { parseEnv } from 'src/env';
import { createRouter } from 'src/lib/create-app';
import {
	authPath,
	STRIPE_ACTIVE_ACCOUNT_FIXED_COST,
	STRIPE_PAYMENT_PERCENTAGE_PROCESSING_COST,
	STRIPE_PAYMENT_FIXED_PROCESSING_COST,
	stripePaymentProcessingCost,
} from 'src/utils/constants';
import { authMiddleware } from 'src/middlewares/authMiddleware';
import { createClient } from 'src/database';
import { transactions } from 'src/database/schemas/transactions';

const stripe = new Stripe(parseEnv(process.env).STRIPE_SECRET_KEY, {
	apiVersion: '2023-08-16',
});

type CustomAccountParams = Stripe.AccountCreateParams & {
	controller?: {
		stripe_dashboard?: {
			type: string;
		};
		fees?: {
			payer: string;
		};
		losses?: {
			payments: string;
		};
		requirement_collection?: string;
	};
};

export const transactionRoute = createRouter()
	.post(
		`${authPath}/account_session`,
		authMiddleware,
		zValidator(
			'json',
			z.object({
				stripe_account_id: z.string(),
			}),
		),
		async (c) => {
			try {
				const { stripe_account_id } = await c.req.valid('json');

				const accountSession = await stripe.accountSessions.create({
					account: stripe_account_id,
					components: {
						account_onboarding: { enabled: true },
					},
				});

				return c.json(
					{
						client_secret: accountSession.client_secret,
					},
					200,
				);
			} catch (error: unknown) {
				console.error('An error occurred when calling the Stripe API to create an account session', error);
				return c.json(
					{
						error: error instanceof Error ? error.message : 'Unknown error occurred',
					},
					500,
				);
			}
		},
	)
	.post(
		`${authPath}/account`,
		authMiddleware,
		zValidator(
			'json',
			z.object({
				order_id: z.number(),
			}),
		),
		async (c) => {
			const { email } = c.var.user;
			const { order_id } = await c.req.json();

			try {
				const accountParams: CustomAccountParams = {
					email,
					controller: {
						stripe_dashboard: {
							type: 'none',
						},
						fees: {
							payer: 'application',
						},
						losses: {
							payments: 'application',
						},
						requirement_collection: 'application',
					},
					capabilities: {
						transfers: { requested: true },
					},
					country: 'IT',
					metadata: {
						order_id,
					},
				};

				const account = await stripe.accounts.create(accountParams);

				return c.json({ account: account.id }, 200);
			} catch (error: unknown) {
				console.error('An error occurred when calling the Stripe API to create an account', error);
				return c.json(
					{
						error: error instanceof Error ? error.message : 'Unknown error occurred',
					},
					500,
				);
			}
		},
	)
	.post(
		'/create-payment-intent',
		authMiddleware,
		zValidator(
			'json',
			z.object({
				item_id: z.number(),
				amount: z.number(),
				sellerStripeAccountId: z.string(),
				buyerId: z.string(),
				sellerId: z.string(),
			}),
		),
		async (c) => {
			const body = c.req.valid('json');

			const { amount, sellerStripeAccountId, buyerId, sellerId, item_id } = body;

			if (amount < 10) {
				return c.json({ error: 'Amount must be greater or equal to 10 cents' }, 400);
			}

			let application_fee_amount;

			// stripe cost is 0.25% + €0.10 per transaction plus €2 per monthly active account,
			// so we need to calculate the application fee based on the amount and the number of monthly active accounts

			const amountInEuros = amount / 100;

			const stripeCost = stripePaymentProcessingCost(amountInEuros);

			const applicationFee = amountInEuros - stripeCost;

			if (applicationFee < 0) {
				return c.json({ error: 'Application fee is negative' }, 400);
			}

			if (amountInEuros < 100) {
				// 6%
				application_fee_amount = amountInEuros * 6;
			} else if (amountInEuros > 100 && amountInEuros < 200) {
				// 5%
				application_fee_amount = amountInEuros * 5;
			} else if (amountInEuros > 200 && amountInEuros < 500) {
				// 4.5%
				application_fee_amount = amountInEuros * 4.5;
			} else if (amountInEuros > 500 && amountInEuros < 1000) {
				// 4%
				application_fee_amount = amountInEuros * 4;
			} else if (amountInEuros > 1000 && amountInEuros < 2000) {
				// 3.5%
				application_fee_amount = amountInEuros * 3.5;
			} else if (amountInEuros > 2000 && amountInEuros < 5000) {
				// 3%
				application_fee_amount = amountInEuros * 3;
			} else if (amountInEuros > 5000 && amountInEuros < 10000) {
				// 2.5%
				application_fee_amount = amountInEuros * 2.5;
			} else {
				// 2%
				application_fee_amount = amountInEuros * 2;
			}

			const paymentIntent = await stripe.paymentIntents.create({
				amount: amountInEuros * 100,
				currency: 'eur',
				automatic_payment_methods: { enabled: true },
				application_fee_amount,
				transfer_data: {
					destination: sellerStripeAccountId,
				},
				metadata: {
					buyerId,
					sellerId,
					item_id,
				},
			});

			const { db } = createClient();

			try {
				await db.insert(transactions).values({
					stripePaymentIntentId: paymentIntent.id,
					payment_status: 'pending_payment',
					amount,
					seller_id: Number(sellerId),
					buyer_id: Number(buyerId),
				});

				return c.json({ clientSecret: paymentIntent.client_secret }, 200);
			} catch (error: unknown) {
				console.error('An error occurred when calling the Stripe API to create a payment intent', error);
				return c.json(
					{
						error: error instanceof Error ? error.message : 'Unknown error occurred',
					},
					500,
				);
			}
		},
	)
	.post('/release', authMiddleware, zValidator('json', z.object({ transactionId: z.number() })), async (c) => {
		const { transactionId } = c.req.valid('json');
		const user = c.var.user;

		const { db } = createClient();

		const transaction = await db.query.transactions.findFirst({
			where: eq(transactions.id, transactionId),
		});

		if (!transaction) return c.text('Not found', 404);
		if (!transaction.seller_id) return c.text('Not found', 404);

		if (transaction.buyer_id !== user.id) return c.text('Forbidden', 403);

		if (transaction.payment_status !== 'waiting_confirmation') {
			return c.text('Invalid status', 400);
		}

		if (!transaction.stripePaymentIntentId) return c.text('Not found', 404);

		// Effettua il trasferimento manuale al venditore
		const transfer = await stripe.transfers.create({
			amount: transaction.amount,
			currency: transaction.currency,
			destination: 'acct_xxx', // dovrai salvarlo nel profilo venditore
			transfer_group: transaction.stripePaymentIntentId,
		});

		await db
			.update(transactions)
			.set({
				payment_status: 'released',
				released_at: new Date(),
			})
			.where(eq(transactions.id, Number(transactionId)));

		return c.json({ success: true, transferId: transfer.id });
	});
