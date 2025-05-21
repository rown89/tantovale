export const chatMessageTypeValues = ['text', 'proposal'] as const;
export type ChatMessageType = (typeof chatMessageTypeValues)[number];

export const orderProposalStatusValues = ['pending', 'accepted', 'rejected', 'expired'] as const;
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
