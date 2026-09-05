import { randomUUID } from 'node:crypto';

import { ShippoCore } from 'shippo/core.js';
import { refundsCreate } from 'shippo/funcs/refundsCreate.js';
import { shipmentsCreate } from 'shippo/funcs/shipmentsCreate.js';
import { transactionsCreate } from 'shippo/funcs/transactionsCreate.js';
import { HTTPClient } from 'shippo/lib/http.js';

function fail(message: string): never {
	throw new Error(message);
}

function nextBusinessDay(now = new Date()): string {
	const date = new Date(now);
	date.setUTCDate(date.getUTCDate() + 1);
	while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() + 1);
	date.setUTCHours(12, 0, 0, 0);
	return date.toISOString();
}

async function main() {
	if (process.env.SHIPPO_TEST_MODE_CONFIRM !== '1') {
		fail('Refusing provider I/O: set SHIPPO_TEST_MODE_CONFIRM=1 to run the opt-in Shippo contract test');
	}
	const apiKey = process.env.SHIPPING_PROVIDER_API_KEY;
	if (!apiKey?.startsWith('shippo_test_')) {
		fail('Refusing provider I/O: SHIPPING_PROVIDER_API_KEY must be a Shippo test-mode key');
	}

	const httpClient = new HTTPClient();
	httpClient.addHook('beforeRequest', (request) => new Request(request, { signal: AbortSignal.timeout(15_000) }));
	const client = new ShippoCore({ apiKeyHeader: apiKey, shippoApiVersion: '2018-02-08', httpClient });
	const metadata = `tv-contract:${randomUUID()}`;
	const shipmentResult = await shipmentsCreate(client, {
		async: false,
		metadata,
		shipmentDate: nextBusinessDay(),
		addressFrom: {
			name: 'Shippo Test Sender',
			street1: '215 Clayton St',
			city: 'San Francisco',
			state: 'CA',
			zip: '94117',
			country: 'US',
			email: 'sender@example.com',
			phone: '+14155550100',
			validate: false,
		},
		addressTo: {
			name: 'Shippo Test Recipient',
			street1: '965 Mission St',
			city: 'San Francisco',
			state: 'CA',
			zip: '94103',
			country: 'US',
			email: 'recipient@example.com',
			phone: '+14155550101',
			validate: false,
		},
		parcels: [{ length: '5', width: '5', height: '5', distanceUnit: 'in', weight: '2', massUnit: 'lb' }],
	});
	if (!shipmentResult.ok) fail('Shippo test shipment creation failed');
	const shipment = shipmentResult.value;
	if (shipment.status !== 'SUCCESS' || shipment.metadata !== metadata || !shipment.objectId) {
		fail('Shippo returned an uncorrelated or unsuccessful test shipment');
	}
	const rate = shipment.rates
		?.filter(
			(candidate) =>
				candidate.test === true && candidate.provider.toUpperCase() === 'USPS' && Boolean(candidate.objectId),
		)
		.sort((left, right) => (left.objectId ?? '').localeCompare(right.objectId ?? ''))[0];
	if (!rate?.objectId) fail('Shippo test shipment returned no USPS test rate');

	const transactionResult = await transactionsCreate(client, {
		rate: rate.objectId,
		async: false,
		labelFileType: 'PDF',
		metadata,
	});
	if (!transactionResult.ok) fail('Shippo test label creation failed');
	const transaction = transactionResult.value;
	const transactionRate = typeof transaction.rate === 'string' ? transaction.rate : transaction.rate?.objectId;
	const failedTransactionChecks = [
		transaction.status === 'SUCCESS' ? undefined : 'status',
		transaction.test === true ? undefined : 'test',
		transaction.metadata === metadata ? undefined : 'metadata',
		transactionRate === rate.objectId ? undefined : 'rate',
		transaction.objectId ? undefined : 'object_id',
		transaction.labelUrl ? undefined : 'label_url',
	].filter((field): field is string => field !== undefined);
	if (failedTransactionChecks.length > 0) {
		if (transaction.status === 'SUCCESS' && transaction.objectId) {
			await refundsCreate(client, { transaction: transaction.objectId, async: false });
		}
		fail(`Shippo returned an invalid test label (${failedTransactionChecks.join(', ')})`);
	}
	const transactionId = transaction.objectId;
	if (!transactionId) fail('Shippo test label is missing its transaction ID');

	const refundResult = await refundsCreate(client, { transaction: transactionId, async: false });
	if (!refundResult.ok) fail('Shippo test refund creation failed');
	const refund = refundResult.value;
	if (
		!refund.objectId ||
		refund.test !== true ||
		refund.transaction !== transactionId ||
		!refund.status ||
		!['QUEUED', 'PENDING', 'SUCCESS'].includes(refund.status)
	) {
		fail('Shippo returned an uncorrelated or rejected test refund');
	}

	process.stdout.write(
		`${JSON.stringify({
			shipment_id: shipment.objectId,
			transaction_id: transactionId,
			refund_id: refund.objectId,
			refund_status: refund.status,
		})}\n`,
	);
}

await main();
