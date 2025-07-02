export const ORDER_PHASES = {
	PAYMENT_PENDING: 'payment_pending',
	PAYMENT_CONFIRMED: 'payment_confirmed',
	PAYMENT_FAILED: 'payment_failed',
	PAYMENT_REFUNDED: 'payment_refunded',
	SHIPPING_PENDING: 'shipping_pending',
	SHIPPING_CONFIRMED: 'shipping_confirmed',
	COMPLETED: 'completed',
	CANCELLED: 'cancelled',
	EXPIRED: 'expired',
} as const;

export const ORDER_PROPOSAL_PHASES = {
	pending: 'pending',
	accepted: 'accepted',
	rejected: 'rejected',
	expired: 'expired',
} as const;

export const chatMessageTypeValues = ['text', 'proposal'] as const;
export type ChatMessageType = (typeof chatMessageTypeValues)[number];

export const orderProposalStatusValues = [
	ORDER_PROPOSAL_PHASES.pending,
	ORDER_PROPOSAL_PHASES.accepted,
	ORDER_PROPOSAL_PHASES.rejected,
	ORDER_PROPOSAL_PHASES.expired,
] as const;
export type OrderProposalStatus = (typeof orderProposalStatusValues)[number];

export const currencyValues = [
	'usd',
	'eur',
	'gbp',
	'cad',
	'aud',
	'jpy',
	'cny',
	'inr',
	'brl',
	'ars',
	'clp',
	'cop',
	'mxn',
	'pen',
	'pyg',
	'uyu',
	'vef',
	'vnd',
	'zar',
] as const;
export type Currency = (typeof currencyValues)[number];

export const profileValues = ['private', 'private_pro', 'shop', 'shop_pro'] as const;
export type Profile = (typeof profileValues)[number];

export const itemImagesSizeValues = ['original', 'small', 'medium', 'thumbnail'] as const;
export type ItemImagesSize = (typeof itemImagesSizeValues)[number];

export const itemStatusValues = ['available', 'sold', 'pending', 'archived'] as const;
export type ItemStatus = (typeof itemStatusValues)[number];

export const itemConditionValues = ['new', 'used-like-new', 'used-good', 'used-fair'] as const;
export type ItemCondition = (typeof itemConditionValues)[number];

export const sexValues = ['male', 'female'] as const;
export type Sex = (typeof sexValues)[number];

export const addressStatusValues = ['active', 'inactive', 'deleted'] as const;
export type AddressStatus = (typeof addressStatusValues)[number];

export const entityTrustapTransactionTypeValues = {
	CREATED: 'created',
	JOINED: 'joined',
	PAID: 'paid',
	REJECTED: 'rejected',
	CANCELLED: 'cancelled',
	TRACKED: 'tracked',
	CANCELLED_WITH_PAYMENT: 'cancelled_with_payment',
	DELIVERED: 'delivered',
	PAYMENT_REFUNDED: 'payment_refunded',
	COMPLAINED: 'complained',
	COMPLAINT_PERIOD_ENDED: 'complaint_period_ended',
	FUNDS_RELEASED: 'funds_released',
} as const;

export const entityTrustapTransactionStatusValues = [
	entityTrustapTransactionTypeValues.CREATED,
	entityTrustapTransactionTypeValues.JOINED,
	entityTrustapTransactionTypeValues.PAID,
	entityTrustapTransactionTypeValues.REJECTED,
	entityTrustapTransactionTypeValues.CANCELLED,
	entityTrustapTransactionTypeValues.TRACKED,
	entityTrustapTransactionTypeValues.CANCELLED_WITH_PAYMENT,
	entityTrustapTransactionTypeValues.DELIVERED,
	entityTrustapTransactionTypeValues.PAYMENT_REFUNDED,
	entityTrustapTransactionTypeValues.COMPLAINED,
	entityTrustapTransactionTypeValues.COMPLAINT_PERIOD_ENDED,
	entityTrustapTransactionTypeValues.FUNDS_RELEASED,
] as const;
export type EntityTrustapTransactionStatus = (typeof entityTrustapTransactionStatusValues)[number];
