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
import {
	trustapChargeResponseSchema,
	trustapCorrelatedTransactionResponseSchema,
	trustapGuestUserResponseSchema,
} from './provider.schemas';
import { parseJsonWithTopLevelTrustapId, type TrustapId } from './trustap-int64';

export type PaymentProviderOperation =
	| 'create_guest_user'
	| 'calculate_charge'
	| 'create_transaction'
	| 'fetch_transaction'
	| 'cancel_transaction'
	| 'provider_request';

export type PaymentProviderErrorCategory = 'http' | 'invalid_response' | 'network' | 'ambiguous';

export class PaymentProviderError extends Error {
	readonly provider = 'trustap' as const;

	constructor(
		message: string,
		readonly operation: PaymentProviderOperation,
		readonly category: PaymentProviderErrorCategory,
	) {
		super(message);
		this.name = 'PaymentProviderError';
	}
}

export class PaymentProviderHttpError extends PaymentProviderError {
	constructor(
		message: string,
		readonly status: number,
		operation: PaymentProviderOperation = 'provider_request',
	) {
		super(message, operation, 'http');
		this.name = 'PaymentProviderHttpError';
	}
}

export class PaymentProviderInvalidResponseError extends PaymentProviderError {
	constructor(operation: PaymentProviderOperation) {
		super('Payment provider returned an invalid response', operation, 'invalid_response');
		this.name = 'PaymentProviderInvalidResponseError';
	}
}

export class PaymentProviderNetworkError extends PaymentProviderError {
	constructor(operation: PaymentProviderOperation) {
		super('Payment provider request failed', operation, 'network');
		this.name = 'PaymentProviderNetworkError';
	}
}

export class PaymentProviderAmbiguousError extends PaymentProviderError {
	constructor(
		message = 'Payment provider transaction outcome requires reconciliation',
		operation: PaymentProviderOperation = 'create_transaction',
	) {
		super(message, operation, 'ambiguous');
		this.name = 'PaymentProviderAmbiguousError';
	}
}

function providerSignal(): AbortSignal {
	return AbortSignal.timeout(environment.PROVIDER_REQUEST_TIMEOUT_MS);
}

const deterministicCreateFailureStatuses = new Set([400, 401, 403, 404]);

export function buildGuestPaymentUrl(transactionId: TrustapId, orderId: number): string {
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
		let response: Response;
		try {
			response = await fetch(`${this.api_url}/${this.api_version}/guest_users`, {
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
		} catch {
			throw new PaymentProviderNetworkError('create_guest_user');
		}

		if (!response.ok) {
			throw new PaymentProviderHttpError(
				'Payment provider guest user request failed',
				response.status,
				'create_guest_user',
			);
		}

		let data: unknown;
		try {
			data = parseJsonWithTopLevelTrustapId(await response.text(), 'id');
		} catch {
			throw new PaymentProviderInvalidResponseError('create_guest_user');
		}
		const parsed = trustapGuestUserResponseSchema.safeParse(data);
		if (!parsed.success || parsed.data.email !== email) {
			throw new PaymentProviderInvalidResponseError('create_guest_user');
		}

		return parsed.data;
	}

	/**
	 * Calculate the transaction fee
	 */
	async calculateTransactionFee({
		...props
	}: CalculateTransactionFeeProps): Promise<CalculateTransactionFeeResponse | undefined> {
		const { price = 0, currency = 'eur', postage_fee = 0, use_hr_post = false } = props;

		let response: Response;
		try {
			response = await fetch(
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
		} catch {
			throw new PaymentProviderNetworkError('calculate_charge');
		}

		if (!response.ok) {
			throw new PaymentProviderHttpError('Payment provider charge request failed', response.status, 'calculate_charge');
		}

		let data: unknown;
		try {
			data = parseJsonWithTopLevelTrustapId(await response.text(), 'id');
		} catch {
			throw new PaymentProviderInvalidResponseError('calculate_charge');
		}
		const parsed = trustapChargeResponseSchema.safeParse(data);
		if (!parsed.success || parsed.data.currency !== currency || parsed.data.price !== price) {
			throw new PaymentProviderInvalidResponseError('calculate_charge');
		}

		return parsed.data;
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
					...(features === undefined ? {} : { features }),
				}),
				signal: providerSignal(),
			});
		} catch {
			throw new PaymentProviderAmbiguousError();
		}

		if (!response.ok) {
			if (deterministicCreateFailureStatuses.has(response.status)) {
				throw new PaymentProviderHttpError(
					'Payment provider transaction request failed',
					response.status,
					'create_transaction',
				);
			}
			throw new PaymentProviderAmbiguousError();
		}

		let data: unknown;
		try {
			data = parseJsonWithTopLevelTrustapId(await response.text(), 'id');
		} catch {
			throw new PaymentProviderAmbiguousError();
		}
		const parsed = trustapCorrelatedTransactionResponseSchema.safeParse(data);
		if (
			!parsed.success ||
			parsed.data.buyer_id !== buyer_id ||
			parsed.data.seller_id !== seller_id ||
			parsed.data.currency !== currency ||
			parsed.data.price !== price ||
			parsed.data.charge !== charge ||
			parsed.data.charge_seller !== 0 ||
			parsed.data.description !== description
		) {
			throw new PaymentProviderAmbiguousError();
		}

		return parsed.data;
	}

	/**
	 * Get transaction status
	 */
	async getTransactionStatus(transactionId: TrustapId): Promise<GetTransactionStatusResponse | undefined> {
		let response: Response;
		try {
			response = await fetch(`${this.api_url}/${this.api_version}/transactions/${transactionId}`, {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Basic ${Buffer.from(`${this.api_key}:`).toString('base64')}`,
				},
				signal: providerSignal(),
			});
		} catch {
			throw new PaymentProviderNetworkError('fetch_transaction');
		}

		if (!response.ok) {
			throw new PaymentProviderHttpError(
				'Payment provider transaction fetch failed',
				response.status,
				'fetch_transaction',
			);
		}

		let data: unknown;
		try {
			data = parseJsonWithTopLevelTrustapId(await response.text(), 'id');
		} catch {
			throw new PaymentProviderInvalidResponseError('fetch_transaction');
		}
		const parsed = trustapCorrelatedTransactionResponseSchema.safeParse(data);
		if (!parsed.success || parsed.data.id !== transactionId) {
			throw new PaymentProviderInvalidResponseError('fetch_transaction');
		}
		return parsed.data;
	}

	async cancelGuestTransaction(
		transactionId: TrustapId,
		actingProviderUserId: string,
	): Promise<CreateTransactionResponse> {
		let response: Response;
		try {
			response = await fetch(
				`${this.api_url}/${this.api_version}/transactions/${transactionId}/cancel_with_guest_user`,
				{
					method: 'POST',
					headers: {
						'Trustap-User': actingProviderUserId,
						'Content-Type': 'application/json',
						Authorization: `Basic ${Buffer.from(`${this.api_key}:`).toString('base64')}`,
					},
					signal: providerSignal(),
				},
			);
		} catch {
			throw new PaymentProviderAmbiguousError(
				'Payment provider cancellation outcome requires reconciliation',
				'cancel_transaction',
			);
		}
		if (!response.ok) {
			throw new PaymentProviderAmbiguousError(
				'Payment provider cancellation outcome requires reconciliation',
				'cancel_transaction',
			);
		}
		let data: unknown;
		try {
			data = parseJsonWithTopLevelTrustapId(await response.text(), 'id');
		} catch {
			throw new PaymentProviderAmbiguousError(
				'Payment provider cancellation outcome requires reconciliation',
				'cancel_transaction',
			);
		}
		const parsed = trustapCorrelatedTransactionResponseSchema.safeParse(data);
		if (
			!parsed.success ||
			parsed.data.id !== transactionId ||
			parsed.data.status !== 'cancelled' ||
			(parsed.data.buyer_id !== actingProviderUserId && parsed.data.seller_id !== actingProviderUserId)
		) {
			throw new PaymentProviderAmbiguousError(
				'Payment provider cancellation outcome requires reconciliation',
				'cancel_transaction',
			);
		}
		return parsed.data;
	}
}
