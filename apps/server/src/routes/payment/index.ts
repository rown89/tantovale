import Stripe from 'stripe';
import { parseEnv } from 'src/env';
import { createRouter } from 'src/lib/create-app';
import { authPath } from 'src/utils/constants';
import { authMiddleware } from 'src/middlewares/authMiddleware';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

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

export const paymentRoute = createRouter()
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
	);
