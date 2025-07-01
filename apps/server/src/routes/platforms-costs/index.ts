import { zValidator } from '@hono/zod-validator';
import { z } from 'zod/v4';

import { createRouter } from '#lib/create-app';
import { authMiddleware } from '#middlewares/authMiddleware/index';
import { authPath, environment } from '#utils/constants';
import { calculatePlatformCosts } from '#utils/platform-costs';

export const platformsCostsRoute = createRouter().post(
	`${authPath}/calculate`,
	authMiddleware,
	zValidator(
		'json',
		z.object({
			price: z.number().min(0.01),
			shipping_price: z.number().min(0.01),
		}),
	),
	async (c) => {
		const user = c.var.user;

		const { price, shipping_price } = c.req.valid('json');

		try {
			const { platform_charge } = await calculatePlatformCosts(
				{
					price,
				},
				{
					platform_charge: true,
				},
			);

			if (!platform_charge) {
				return c.json({ error: 'Failed to get platform_charge cost' }, 500);
			}

			const { payment_provider_charge, payment_provider_charge_calculator_version } = await calculatePlatformCosts(
				{
					price: price + shipping_price + platform_charge,
				},
				{
					payment_provider_charge: true,
				},
			);

			const platformSettings = {
				platform_charge,
				payment_provider_charge,
			};

			return c.json(
				{ ...platformSettings, proposalExpireTime: environment.PROPOSALS_HANDLING_TOLLERANCE_IN_HOURS },
				200,
			);
		} catch (error) {
			return c.json({ error: `Failed to get platforms costs: ${error}` }, 500);
		}
	},
);
