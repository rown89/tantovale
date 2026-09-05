import { describe, expect, it } from 'vitest';

import { parseProviderDecimalToCents } from '../../src/routes/shipment-provider/shipment.service';

describe('Shippo decimal money parsing', () => {
	it.each([
		['19.99', 1_999],
		['17.35', 1_735],
		['0.01', 1],
		['21474836.47', 2_147_483_647],
		['19.9900', 1_999],
	] as const)('parses %s exactly as %i cents', (amount, cents) => {
		expect(parseProviderDecimalToCents(amount)).toBe(cents);
	});

	it.each(['0', '-1.00', '+1.00', '1.001', '1.999', 'NaN', 'Infinity', '1e2', '21474836.48', ''])(
		'rejects unsafe provider amount %s',
		(amount) => {
			expect(parseProviderDecimalToCents(amount)).toBeUndefined();
		},
	);
});
