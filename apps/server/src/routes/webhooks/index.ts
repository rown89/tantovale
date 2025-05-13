import { createRouter } from 'src/lib/create-app';

export const webhooksRoute = createRouter().get('/payment_provider_events', async (c) => {
	return c.json(
		{
			message: 'ok',
		},
		200,
	);
});
