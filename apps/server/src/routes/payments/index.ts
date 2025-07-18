import { createRouter } from '#lib/create-app';
import { zValidator } from '@hono/zod-validator';
import { env } from 'hono/adapter';
import { z } from 'zod/v4';

const connectLinkStates = ['profile-connect-button'] as const;

export const paymentsRoute = createRouter().get(
	'/trustap/connect_link/:state',
	zValidator(
		'param',
		z.object({
			state: z.enum(connectLinkStates),
		}),
	),
	async (c) => {
		const {
			PAYMENT_PROVIDER_AUTH_SERVER,
			PAYMENT_PROVIDER_REALM,
			PAYMENT_PROVIDER_CLIENT_ID,
			PP_POST_OAUTH_REDIRECT_URL,
		} = env<{
			PAYMENT_PROVIDER_AUTH_SERVER: string;
			PAYMENT_PROVIDER_REALM: string;
			PAYMENT_PROVIDER_CLIENT_ID: string;
			PP_POST_OAUTH_REDIRECT_URL: string;
		}>(c);

		const { state } = c.req.valid('param');

		if (!connectLinkStates.includes(state)) {
			return c.json({ error: 'Invalid state' }, 400);
		}

		const server = PAYMENT_PROVIDER_AUTH_SERVER;
		const realm = PAYMENT_PROVIDER_REALM;
		const client_id = PAYMENT_PROVIDER_CLIENT_ID;
		const redirect_uri = PP_POST_OAUTH_REDIRECT_URL;

		const scope =
			'openid basic_tx:offline_create_join basic_tx:offline_accept_payment basic_tx:offline_cancel basic_tx:offline_accept_payment';

		const connect_link = `${server}/auth/realms/${realm}/protocol/openid-connect/auth?client_id=${client_id}&redirect_uri=${redirect_uri}&response_type=code&scope=${scope}&state=${state}`;

		return c.json(
			{
				success: true,
				connect_link,
			},
			200,
		);
	},
);
