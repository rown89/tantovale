import { environment } from '#utils/constants';
import {
	CalculateTransactionFeeProps,
	CreateUserGuestResponse,
	CalculateTransactionFeeResponse,
	CreateTransactionResponse,
	CreateGuestUserProps,
	GetTransactionStatusResponse,
	CreateTransactionWithBothUsersProps,
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
		price = 0,
		currency = 'eur',
		postage_fee = 0,
		use_hr_post = false,
	}: CalculateTransactionFeeProps): Promise<CalculateTransactionFeeResponse | undefined> {
		const response = await fetch(
			`${this.api_url}/${this.api_version}/charge?price=${price}&currency=${currency}&postage_fee=${postage_fee}&use_hr_post=${use_hr_post}`,
			{
				method: 'GET',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${this.api_key}`,
				},
			},
		);

		const data = (await response.json()) as CalculateTransactionFeeResponse | undefined;

		return data;
	}

	/**
	 * Create a transaction
	 */
	async createTransactionWithBothUsers({
		buyer_id,
		seller_id,
		creator_role,
		currency,
		description,
		price,
		postage_fee,
		charge,
		charge_calculator_version,
	}: CreateTransactionWithBothUsersProps): Promise<CreateTransactionResponse | undefined> {
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
				postage_fee,
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

	/**
	 * Get transaction status
	 */
	async getTransactionStatus(transactionId: number): Promise<GetTransactionStatusResponse | undefined> {
		const response = await fetch(`${this.api_url}/${this.api_version}/transactions/${transactionId}`, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${this.api_key}`,
			},
		});

		if (!response.ok) {
			throw new Error('Failed to get transaction status');
		}

		const data = (await response.json()) as GetTransactionStatusResponse | undefined;

		return data;
	}

	/**
	 * Verify webhook signature (implement based on Trustap documentation)
	 */
	verifyWebhookSignature(payload: any, signature: string | undefined): boolean {
		// TODO: Implement webhook signature verification based on Trustap documentation
		// This is a placeholder - you should implement proper signature verification
		if (!signature) {
			console.warn('No webhook signature provided');
			return false;
		}

		// Example implementation (adjust based on Trustap's signature method):
		// const expectedSignature = crypto
		//   .createHmac('sha256', this.webhook_secret)
		//   .update(JSON.stringify(payload))
		//   .digest('hex');
		// return signature === expectedSignature;

		return true; // Placeholder - implement proper verification
	}
}
