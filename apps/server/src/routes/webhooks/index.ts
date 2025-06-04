import { createRouter } from 'src/lib/create-app';

export const webhooksRoute = createRouter().get('/pp_events', async (c) => {
	return c.json(
		{
			message: 'ok',
		},
		200,
	);
});
