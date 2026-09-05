const fixtureTimestamp = '2026-08-30T12:00:00.000Z';

export const shippoCarrierAccountsFixture = {
	next: '',
	previous: '',
	results: [
		{
			account_id: 'account-test',
			active: true,
			carrier: 'poste_italiane',
			carrier_name: 'Poste Italiane',
			object_id: 'carrier-account-test',
			object_owner: 'shippo-test@tantovale.test',
			test: true,
		},
		{
			account_id: 'inactive-account-test',
			active: false,
			carrier: 'test_inactive',
			carrier_name: 'Inactive Test Carrier',
			object_id: 'carrier-account-inactive-test',
			object_owner: 'shippo-test@tantovale.test',
			test: true,
		},
	],
} as const;

export const shippoRateFixture = {
	amount: '7.50',
	amount_local: '7.50',
	attributes: ['BESTVALUE'],
	carrier_account: 'carrier-account-test',
	currency: 'EUR',
	currency_local: 'EUR',
	estimated_days: 2,
	object_created: fixtureTimestamp,
	object_id: 'rate-test',
	object_owner: 'shippo-test@tantovale.test',
	provider: 'Poste Italiane',
	servicelevel: {
		name: 'Standard',
		token: 'poste_italiane_standard',
	},
	shipment: 'shipment-test',
	test: true,
} as const;

export const shippoShipmentFixture = {
	address_from: {
		city: 'Rome',
		country: 'IT',
		name: 'Seller Test',
		street1: 'Via del Test 1',
		zip: '00100',
	},
	address_to: {
		city: 'Milan',
		country: 'IT',
		name: 'Buyer Test',
		street1: 'Via della Prova 2',
		zip: '20100',
	},
	carrier_accounts: ['carrier-account-test'],
	messages: [],
	metadata: 'Tantovale test shipment',
	object_created: fixtureTimestamp,
	object_id: 'shipment-test',
	object_owner: 'shippo-test@tantovale.test',
	object_updated: fixtureTimestamp,
	parcels: [
		{
			distance_unit: 'cm',
			height: '10',
			length: '20',
			mass_unit: 'kg',
			weight: '1',
			width: '15',
		},
	],
	rates: [shippoRateFixture],
	status: 'SUCCESS',
	test: true,
} as const;

export const shippoTransactionFixture = {
	label_file_type: 'PDF',
	label_url: 'https://labels.test/label-transaction-test.pdf',
	messages: [],
	metadata: 'tv-label:1:00000000-0000-4000-8000-000000000001',
	object_created: fixtureTimestamp,
	object_id: 'label-transaction-test',
	object_owner: 'shippo-test@tantovale.test',
	object_state: 'VALID',
	object_updated: fixtureTimestamp,
	rate: 'rate-test',
	status: 'SUCCESS',
	test: true,
	tracking_number: 'TRACK-TEST-1',
	tracking_url_provider: 'https://tracking.test/TRACK-TEST-1',
} as const;

export const shippoRefundFixture = {
	object_created: fixtureTimestamp,
	object_id: 'refund-test',
	object_owner: 'shippo-test@tantovale.test',
	object_updated: fixtureTimestamp,
	status: 'SUCCESS',
	test: true,
	transaction: shippoTransactionFixture.object_id,
} as const;
