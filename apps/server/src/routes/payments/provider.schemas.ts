import { entityTrustapTransactionStatusValues } from '#database/schemas/enumerated_values';
import { z } from 'zod';

import { canonicalTrustapId } from './trustap-int64';

const postgresIntegerMax = 2_147_483_647;
const postgresInteger = z.number().int().min(0).max(postgresIntegerMax);
const positivePostgresInteger = postgresInteger.min(1);
const providerTimestamp = z.string().datetime({ offset: true });

/**
 * Trustap v1 sends transaction IDs as JSON integers. The boundary JSON reader
 * preserves that token as a canonical decimal string before Zod sees it so a
 * signed-int64 ID cannot be rounded by JavaScript.
 */
const trustapTransactionIdSchema = z
	.union([z.number().int().positive().safe(), z.string().regex(/^[1-9]\d*$/u)])
	.transform((value, context) => {
		const id = canonicalTrustapId(value);
		if (id) return id;
		context.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid Trustap transaction identifier' });
		return z.NEVER;
	});

export const trustapGuestUserResponseSchema = z.object({
	created_at: providerTimestamp,
	email: z.string().email(),
	id: z.string().trim().min(1).max(100),
});

export const trustapChargeResponseSchema = z.object({
	charge: postgresInteger,
	charge_calculator_version: positivePostgresInteger,
	charge_seller: z.literal(0),
	currency: z.literal('eur'),
	postage_fee: postgresInteger,
	price: positivePostgresInteger,
});

export const trustapTransactionResponseSchema = z.object({
	buyer_id: z.string().trim().min(1).max(100),
	charge: postgresInteger,
	charge_seller: postgresInteger,
	client_id: z.string().trim().min(1),
	created: providerTimestamp,
	currency: z.literal('eur'),
	delivered: providerTimestamp.optional(),
	description: z.string(),
	funds_released: providerTimestamp.optional(),
	id: trustapTransactionIdSchema,
	is_payment_in_progress: z.boolean(),
	joined: providerTimestamp.optional(),
	paid: providerTimestamp.optional(),
	postage_fee: postgresInteger,
	posta_hr_tracking: z
		.object({
			barcode: z.string().min(1),
			barcode_generated: providerTimestamp,
		})
		.optional(),
	price: positivePostgresInteger,
	quantity: z.number().int().positive(),
	seller_id: z.string().trim().min(1).max(100),
	status: z.enum(entityTrustapTransactionStatusValues),
	tracked: providerTimestamp.optional(),
	tracking: z
		.object({
			carrier: z.string().min(1),
			tracking_code: z.string().min(1),
		})
		.optional(),
});

export type TrustapGuestUserResponse = z.infer<typeof trustapGuestUserResponseSchema>;
export type TrustapChargeResponse = z.infer<typeof trustapChargeResponseSchema>;
export type TrustapTransactionResponse = z.infer<typeof trustapTransactionResponseSchema>;
