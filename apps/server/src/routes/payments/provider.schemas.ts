import { entityTrustapTransactionStatusValues } from '#database/schemas/enumerated_values';
import { z } from 'zod';

import { canonicalTrustapId } from './trustap-int64';

const postgresIntegerMax = 2_147_483_647;
const postgresInteger = z.number().int().min(0).max(postgresIntegerMax);
const positivePostgresInteger = postgresInteger.min(1);
const providerTimestamp = z.string().datetime({ offset: true });
const providerUserId = z.string().trim().min(1).max(100);

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
	charge_buyer_client: postgresInteger,
	charge_calculator_version: positivePostgresInteger,
	charge_seller: z.literal(0),
	charge_seller_client: postgresInteger,
	currency: z.literal('eur'),
	price: positivePostgresInteger,
});

export const trustapTransactionResponseSchema = z.object({
	buyer_id: providerUserId.optional(),
	charge: postgresInteger,
	charge_buyer_client: postgresInteger,
	charge_seller: postgresInteger,
	charge_seller_client: postgresInteger,
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
	posta_hr_tracking: z
		.object({
			barcode: z.string().min(1),
			barcode_generated: providerTimestamp,
		})
		.optional(),
	price: positivePostgresInteger,
	quantity: z.number().int().positive(),
	seller_id: providerUserId.optional(),
	status: z.enum(entityTrustapTransactionStatusValues),
	tracked: providerTimestamp.optional(),
	tracking: z
		.object({
			carrier: z.string().min(1),
			tracking_code: z.string().min(1),
		})
		.optional(),
});

// Trustap marks the participant IDs optional in its general v1 response. Tantovale's
// guest-user commerce flows require both before accepting remote evidence, because
// polling and recovery must correlate it with the durable buyer/seller identities.
export const trustapCorrelatedTransactionResponseSchema = trustapTransactionResponseSchema.extend({
	buyer_id: providerUserId,
	seller_id: providerUserId,
});

export type TrustapGuestUserResponse = z.infer<typeof trustapGuestUserResponseSchema>;
export type TrustapChargeResponse = z.infer<typeof trustapChargeResponseSchema>;
export type TrustapTransactionResponse = z.infer<typeof trustapCorrelatedTransactionResponseSchema>;
