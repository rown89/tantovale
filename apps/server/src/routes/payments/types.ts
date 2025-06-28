export interface CreateGuestUserProps {
	id: number;
	email: string;
	first_name: string;
	last_name: string;
	country_code: string;
	tos_acceptance: {
		unix_timestamp: number;
		ip_address: string;
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
}

export interface CalculateTransactionFeeResponse {
	charge: number;
	charge_calculator_version: number;
	charge_seller: string;
	currency: string;
	price: number;
}

export interface CreateTransactionProps {
	buyer_id: string;
	seller_id: string;
	creator_role: 'buyer' | 'seller';
	currency: 'eur';
	description: string;
	price: number;
	charge: number;
	charge_calculator_version: number;
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
	id: number;
	is_payment_in_progress: boolean;
	joined: string;
	paid: string;
	price: number;
	quantity: number;
	seller_id: string;
	status: string;
}
