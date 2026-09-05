export const trustapGuestUserFixture = {
	created_at: '2026-08-30T12:00:00.000Z',
	email: 'buyer@tantovale.test',
	id: 'guest-101',
} as const;

export const trustapChargeFixture = {
	charge: 500,
	charge_buyer_client: 0,
	charge_calculator_version: 1,
	charge_seller: 0,
	charge_seller_client: 0,
	currency: 'eur',
	price: 10_000,
} as const;

export const trustapPostageFeeFixture = 750;

export const trustapTransactionFixture = {
	buyer_id: 'guest-buyer-test',
	charge: 500,
	charge_buyer_client: 0,
	charge_seller: 0,
	charge_seller_client: 0,
	client_id: 'trustap-test-client',
	created: '2026-08-30T12:00:00.000Z',
	currency: 'eur',
	description: 'Test listing',
	id: 91_001,
	is_payment_in_progress: false,
	price: 10_000,
	quantity: 1,
	seller_id: 'guest-seller-test',
	status: 'created',
} as const;
