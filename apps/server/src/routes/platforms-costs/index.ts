import { zValidator } from '@hono/zod-validator';
import { z } from 'zod/v4';

import { createRouter } from '#lib/create-app';
import { authMiddleware } from '#middlewares/authMiddleware/index';
import { authPath, environment } from '#utils/constants';
import { calculatePlatformCosts } from '#utils/platform-costs';

const calculatePlatformCostsSchema = z.object({
	price: z.number().min(0.01),
	shipping_price: z.number().min(0.01),
});

export const platformsCostsRoute = createRouter().post(
	`${authPath}/calculate_platform_costs`,
	authMiddleware,
	zValidator('json', calculatePlatformCostsSchema),
	async (c) => {
		const { price, shipping_price } = c.req.valid('json');

		try {
			// Calculate platform charge amount
			const { platform_charge_amount } = await calculatePlatformCosts(
				{ price: price },
				{ platform_charge_amount: true },
			);

			// Calculate payment provider charge with the total amount (including platform charge)
			const transactionPreviewPrice = price + platform_charge_amount!;

			const { payment_provider_charge } = await calculatePlatformCosts(
				{
					price: transactionPreviewPrice,
					postage_fee: shipping_price,
				},
				{
					payment_provider_charge: true,
				},
			);

			const platformSettings = {
				platform_charge: platform_charge_amount,
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
