import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	canonicalTrustapId,
	parseJsonWithTopLevelTrustapId,
	publicTrustapId,
} from '../../src/routes/payments/trustap-int64';
import { PaymentProviderService } from '../../src/routes/payments/payment-provider.service';
import { trustapTransactionFixture } from '../fixtures/providers/trustap-v1';

afterEach(() => vi.unstubAllGlobals());

describe('Trustap signed int64 identifiers', () => {
	it('parses a numeric max-int64 JSON id without IEEE-754 precision loss', () => {
		expect(parseJsonWithTopLevelTrustapId('{"id":9223372036854775807,"status":"created"}', 'id')).toEqual({
			id: '9223372036854775807',
			status: 'created',
		});
	});

	it.each(['1', '9007199254740991', '9223372036854775807'])('accepts canonical positive int64 %s', (id) => {
		expect(canonicalTrustapId(id)).toBe(id);
	});

	it.each(['0', '-1', '01', '9223372036854775808', '1.5', ''])('rejects invalid int64 %s', (id) => {
		expect(canonicalTrustapId(id)).toBeUndefined();
	});

	it('preserves numeric compatibility only while the identifier is safe', () => {
		expect(publicTrustapId('91001')).toBe(91_001);
		expect(publicTrustapId('9223372036854775807')).toBe('9223372036854775807');
	});

	it('parses a max-int64 provider response without emitting a BigInt to JSON consumers', async () => {
		const transactionId = '9223372036854775807';
		const body = JSON.stringify({ ...trustapTransactionFixture, id: 0 }).replace('"id":0', `"id":${transactionId}`);
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })));

		const transaction = await new PaymentProviderService().getTransactionStatus(transactionId);

		expect(transaction).toMatchObject({ id: transactionId });
		expect(JSON.stringify(transaction)).toContain(transactionId);
	});
});
