export const chatMessageTypeValues = ['text', 'proposal'] as const;
export type ChatMessageType = (typeof chatMessageTypeValues)[number];

export const orderProposalStatusValues = ['pending', 'accepted', 'rejected', 'expired'] as const;
export type OrderProposalStatus = (typeof orderProposalStatusValues)[number];

export const orderStatusValues = ['pending_payment', 'confirmed', 'cancelled'] as const;
export type OrderStatus = (typeof orderStatusValues)[number];

export const transactionStatusValues = ['pending_payment', 'waiting_confirmation', 'released', 'refunded'] as const;
export type TransactionStatus = (typeof transactionStatusValues)[number];

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

export const filterTypeValues = ['select', 'select_multi', 'boolean', 'checkbox', 'radio', 'number'] as const;
export type FilterType = (typeof filterTypeValues)[number];

export const itemStatusValues = ['available', 'sold', 'pending', 'archived'] as const;
export type ItemStatus = (typeof itemStatusValues)[number];

export const itemConditionValues = ['new', 'used-like-new', 'used-good', 'used-fair'] as const;
export type ItemCondition = (typeof itemConditionValues)[number];

export const deliveryMethodValues = ['shipping', 'pickup'] as const;
export type DeliveryMethod = (typeof deliveryMethodValues)[number];

export const productConditionValues = ['new', 'used-like-new', 'used-good', 'used-fair'] as const;
export type ProductCondition = (typeof productConditionValues)[number];

export const sexValues = ['male', 'female'] as const;
export type Sex = (typeof sexValues)[number];
