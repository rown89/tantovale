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

export class PaymentProviderHttpError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
		this.name = 'PaymentProviderHttpError';
	}
}

export class PaymentProviderAmbiguousError extends Error {
	constructor(message = 'Payment provider transaction outcome requires reconciliation') {
		super(message);
		this.name = 'PaymentProviderAmbiguousError';
	}
}

function providerSignal(): AbortSignal {
	return AbortSignal.timeout(environment.PROVIDER_REQUEST_TIMEOUT_MS);
}

function isTransactionResponse(value: unknown): value is CreateTransactionResponse {
	if (typeof value !== 'object' || value === null) return false;
	const candidate = value as Partial<CreateTransactionResponse>;
	return (
		Number.isSafeInteger(candidate.id) &&
		(candidate.id ?? 0) > 0 &&
		Number.isSafeInteger(candidate.price) &&
		(candidate.price ?? 0) > 0 &&
		Number.isSafeInteger(candidate.charge) &&
		(candidate.charge ?? -1) >= 0 &&
		Number.isSafeInteger(candidate.charge_seller) &&
		(candidate.charge_seller ?? -1) >= 0 &&
		typeof candidate.buyer_id === 'string' &&
		typeof candidate.seller_id === 'string' &&
		candidate.currency === 'eur' &&
		typeof candidate.status === 'string'
	);
}

export function buildGuestPaymentUrl(transactionId: number, orderId: number): string {
	const base = new URL(environment.PAYMENT_PROVIDER_PAY_PAGE_URL);
	const basePath = base.pathname.replace(/\/$/u, '');
	const transactionBase = basePath.endsWith('/online/transactions') ? basePath : `${basePath}/online/transactions`;
	base.pathname = `${transactionBase}/${encodeURIComponent(String(transactionId))}/guest_pay`;
	base.search = '';
	const redirect = new URL('/auth/profile/orders', environment.POST_PAYMENT_REDIRECT_URL);
	redirect.searchParams.set('highlight', String(orderId));
	base.searchParams.set('redirect_uri', redirect.toString());
	return base.toString();
}

export class PaymentProviderService {
	private api_url = environment.PAYMENT_PROVIDER_API_URL;
	private api_version = environment.PAYMENT_PROVIDER_API_VERSION;
	private api_key = environment.PAYMENT_PROVIDER_API_KEY;

	/**
	 * Create a guest user for the payment provider
	 */
	async createGuestUser({ ...props }: CreateGuestUserProps): Promise<CreateUserGuestResponse> {
		const { id, email, first_name, last_name, country_code, tos_acceptance } = props;
		const response = await fetch(`${this.api_url}/${this.api_version}/guest_users`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Basic ${Buffer.from(`${this.api_key}:`).toString('base64')}`,
			},
			body: JSON.stringify({
				id,
				email,
				first_name,
				last_name,
				country_code,
				tos_acceptance,
			}),
			signal: providerSignal(),
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
		...props
	}: CalculateTransactionFeeProps): Promise<CalculateTransactionFeeResponse | undefined> {
		const { price = 0, currency = 'eur', postage_fee = 0, use_hr_post = false } = props;

		const response = await fetch(
			`${this.api_url}/${this.api_version}/charge?price=${price}&currency=${currency}&postage_fee=${postage_fee}&use_hr_post=${use_hr_post}`,
			{
				method: 'GET',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Basic ${Buffer.from(`${this.api_key}:`).toString('base64')}`,
				},
				signal: providerSignal(),
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
	async createTransactionWithBothUsers({
		...props
	}: CreateTransactionWithBothUsersProps): Promise<CreateTransactionResponse | undefined> {
		const {
			buyer_id,
			seller_id,
			creator_role,
			currency,
			description,
			price,
			postage_fee,
			charge,
			charge_calculator_version,
			features,
		} = props;

		let response: Response;
		try {
			response = await fetch(`${this.api_url}/${this.api_version}/me/transactions/create_with_guest_user`, {
				method: 'POST',
				headers: {
					'Trustap-User': creator_role === 'buyer' ? buyer_id : seller_id,
					'Content-Type': 'application/json',
					Authorization: `Basic ${Buffer.from(`${this.api_key}:`).toString('base64')}`,
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
					features: features ?? ['use_custom_postage_fee'],
				}),
				signal: providerSignal(),
			});
		} catch {
			throw new PaymentProviderAmbiguousError();
		}

		if (!response.ok) {
			if (response.status >= 400 && response.status < 500 && response.status !== 409) {
				throw new PaymentProviderHttpError('Failed to create transaction', response.status);
			}
			throw new PaymentProviderAmbiguousError();
		}

		let data: unknown;
		try {
			data = await response.json();
		} catch {
			throw new PaymentProviderAmbiguousError();
		}
		if (
			!isTransactionResponse(data) ||
			data.buyer_id !== buyer_id ||
			data.seller_id !== seller_id ||
			data.currency !== currency ||
			data.price !== price ||
			data.charge !== charge
		) {
			throw new PaymentProviderAmbiguousError();
		}

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
				Authorization: `Basic ${Buffer.from(`${this.api_key}:`).toString('base64')}`,
			},
			signal: providerSignal(),
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
	verifyWebhookSignature(payload: unknown, signature: string | undefined): boolean {
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
