import { environment } from '#utils/constants';
import {
	CalculateTransactionFeeProps,
	CreateTransactionProps,
	CreateUserGuestResponse,
	CalculateTransactionFeeResponse,
	CreateTransactionResponse,
	CreateGuestUserProps,
} from './types';

export class PaymentProviderService {
	private api_url = environment.PAYMENT_PROVIDER_API_URL;
	private api_version = environment.PAYMENT_PROVIDER_API_VERSION;
	private api_key = environment.PAYMENT_PROVIDER_SECRET_KEY;

	/**
	 * Create a guest user for the payment provider
	 */
	async createGuestUser({
		id,
		email,
		first_name,
		last_name,
		country_code,
		tos_acceptance,
	}: CreateGuestUserProps): Promise<CreateUserGuestResponse> {
		const response = await fetch(`${this.api_url}/${this.api_version}/guest_users`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${this.api_key}`,
			},
			body: JSON.stringify({
				id,
				email,
				first_name,
				last_name,
				country_code,
				tos_acceptance,
			}),
		});

		if (!response.ok) {
			throw new Error('Failed to create guest user');
		}

		const data = (await response.json()) as { created_at: string; email: string; id: string };

		return data;
	}

	/**
	 * Calculate the transaction fee
	 */
	async calculateTransactionFee({
		price,
		currency,
	}: CalculateTransactionFeeProps): Promise<CalculateTransactionFeeResponse | undefined> {
		const response = await fetch(
			`${this.api_url}/${this.api_version}/calculate_transaction_fee?price=${price}&currency=${currency}`,
			{
				method: 'GET',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${this.api_key}`,
				},
			},
		);

		if (!response.ok) {
			throw new Error('Failed to calculate transaction fee');
		}

		const data = (await response.json()) as CalculateTransactionFeeResponse | undefined;

		return data;
	}

	/**
	 * Create a transaction
	 */
	async createTransaction({
		buyer_id,
		seller_id,
		creator_role,
		currency,
		description,
		price,
		charge,
		charge_calculator_version,
	}: CreateTransactionProps): Promise<CreateTransactionResponse | undefined> {
		const response = await fetch(`${this.api_url}/${this.api_version}/me/transactions/create_with_guest_user`, {
			method: 'POST',
			headers: {
				'Trustap-User': seller_id,
				'Content-Type': 'application/json',
				Authorization: `Bearer ${this.api_key}`,
			},
			body: JSON.stringify({
				seller_id,
				buyer_id,
				creator_role,
				currency,
				description,
				price,
				charge,
				charge_calculator_version,
			}),
		});

		if (!response.ok) {
			throw new Error('Failed to create transaction');
		}

		const data = (await response.json()) as CreateTransactionResponse | undefined;

		return data;
	}
}
