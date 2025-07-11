export const chatMessageTypeValues = ['text', 'proposal', 'system', 'buy_now'] as const;
export type ChatMessageType = (typeof chatMessageTypeValues)[number];

export const ORDER_PHASES = {
	/**
	 * The order is pending payment
	 * This state an order from a proposal or if the user has used the "Buy Now" button in the item page
	 */
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

/**
 * States that are blocked for the user to place a new order
 */
export const newOrderBlockedStates = [
	ORDER_PHASES.PAYMENT_PENDING,
	ORDER_PHASES.PAYMENT_CONFIRMED,
	ORDER_PHASES.SHIPPING_PENDING,
	ORDER_PHASES.SHIPPING_CONFIRMED,
	ORDER_PHASES.COMPLETED,
];

export const ORDER_PROPOSAL_PHASES = {
	pending: 'pending',
	accepted: 'accepted',
	rejected: 'rejected',
	buyer_aborted: 'buyer_aborted',
	expired: 'expired',
} as const;

export const orderProposalStatusValues = [
	ORDER_PROPOSAL_PHASES.pending,
	ORDER_PROPOSAL_PHASES.accepted,
	ORDER_PROPOSAL_PHASES.rejected,
	ORDER_PROPOSAL_PHASES.expired,
	ORDER_PROPOSAL_PHASES.buyer_aborted,
] as const;
export type OrderProposalStatus = (typeof orderProposalStatusValues)[number];

export const chatMessageMetadataValues = {
	proposal_accepted: 'proposal_accepted',
	proposal_rejected: 'proposal_rejected',
	proposal_expired: 'proposal_expired',
	proposal_buyer_aborted: 'proposal_buyer_aborted',
} as const;
export type ChatMessageMetadata = {
	type: (typeof chatMessageMetadataValues)[keyof typeof chatMessageMetadataValues];
	order_id: number;
};

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

export const itemStatus = {
	AVAILABLE: 'available',
	SOLD: 'sold',
	PENDING: 'pending',
	ARCHIVED: 'archived',
} as const;

export const itemStatusValues = [
	itemStatus.AVAILABLE,
	itemStatus.SOLD,
	itemStatus.PENDING,
	itemStatus.ARCHIVED,
] as const;
export type ItemStatus = (typeof itemStatusValues)[number];

export const itemConditionValues = ['new', 'used-like-new', 'used-good', 'used-fair'] as const;
export type ItemCondition = (typeof itemConditionValues)[number];

export const sexValues = ['male', 'female'] as const;
export type Sex = (typeof sexValues)[number];

export const addressStatus = {
	ACTIVE: 'active',
	INACTIVE: 'inactive',
	DELETED: 'deleted',
} as const;
export const addressStatusValues = [addressStatus.ACTIVE, addressStatus.INACTIVE, addressStatus.DELETED] as const;
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
