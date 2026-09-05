import type { TrustapChargeResponse, TrustapGuestUserResponse, TrustapTransactionResponse } from './provider.schemas';
import type { TrustapId } from './trustap-int64';

export interface CreateGuestUserProps {
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

// Tantovale owns shipping through Shippo and must not enable Trustap's managed `use_shippo` feature.
// Trustap v1 requires `use_custom_postage_fee` for an externally purchased label's postage_fee to be retained.
// The field is accepted by the v1 API even though its public Feature enum does not currently list it.
export type TrustapTransactionFeature = 'require_seller_acceptance' | 'use_custom_postage_fee' | 'use_hr_post';

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

export interface CancelGuestTransactionProps {
	transaction_id: TrustapId;
	acting_provider_user_id: string;
	buyer_id: string;
	seller_id: string;
	currency: 'eur';
	description: string;
	price: number;
	charge: number;
	charge_seller: number;
}

export interface TrackGuestTransactionProps {
	transaction_id: TrustapId;
	acting_provider_user_id: string;
	buyer_provider_user_id: string;
	carrier: string;
	tracking_code: string;
}
