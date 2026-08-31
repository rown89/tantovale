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

export interface CreateUserGuestResponse {
	created_at: string;
	email: string;
	id: string;
}

export interface CalculateTransactionFeeProps {
	price: number;
	currency: string;
	postage_fee?: number;
	use_hr_post?: boolean;
}

export interface CalculateTransactionFeeResponse {
	charge: number;
	charge_calculator_version: number;
	charge_seller: number;
	currency: string;
	postage_fee: number;
	price: number;
}

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
	features?: ['use_custom_postage_fee'];
}

export interface CreateTransactionResponse {
	buyer_id: string;
	charge: number;
	charge_seller: number;
	client_id: string;
	created: string;
	currency: string;
	description: string;
	funds_released: string;
	/** A positive Trustap signed-int64 identifier, represented losslessly. */
	id: string;
	is_payment_in_progress: boolean;
	joined: string;
	paid: string;
	postage_fee: number;
	price: number;
	quantity: number;
	seller_id: string;
	status: string;
}

export interface GetTransactionStatusResponse extends CreateTransactionResponse {
	delivered?: string;
	fund_released?: string;
	posta_hr_tracking?: {
		barcode: string;
		barcode_generated: string;
	};
	tracked?: string;
	tracking?: {
		carrier: string;
		tracking_code: string;
	};
}
