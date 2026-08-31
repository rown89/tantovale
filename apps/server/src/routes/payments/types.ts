import type { TrustapChargeResponse, TrustapGuestUserResponse, TrustapTransactionResponse } from './provider.schemas';

export interface CreateGuestUserProps {
	id: number;
	email: string;
	first_name: string;
	last_name: string;
	country_code: string;
	tos_acceptance: {
		unix_timestamp: number;
		ip: string;
	};
}

export type CreateUserGuestResponse = TrustapGuestUserResponse;

export interface CalculateTransactionFeeProps {
	price: number;
	currency: string;
	postage_fee?: number;
	use_hr_post?: boolean;
}

export type CalculateTransactionFeeResponse = TrustapChargeResponse;

export type TrustapTransactionFeature = 'require_seller_acceptance' | 'use_hr_post' | 'use_shippo';

export interface CreateTransactionWithBothUsersProps {
	buyer_id: string;
	seller_id: string;
	creator_role: 'buyer' | 'seller';
	currency: 'eur';
	description: string;
	price: number;
	postage_fee: number;
	charge: number;
	charge_calculator_version: number;
	features?: TrustapTransactionFeature[];
}

export type CreateTransactionResponse = TrustapTransactionResponse;

export type GetTransactionStatusResponse = TrustapTransactionResponse;
