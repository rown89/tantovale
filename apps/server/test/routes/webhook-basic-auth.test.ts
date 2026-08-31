import { describe, expect, it, vi } from 'vitest';

import { createTrustapBasicAuthorizationValidator } from '../../src/routes/webhooks/basic-auth';

describe('Trustap webhook Basic credential comparison', () => {
	it('compares both equal-length components even when the username comparison fails', () => {
		const compare = vi.fn((left: Buffer, right: Buffer) => left.equals(right));
		const validate = createTrustapBasicAuthorizationValidator(
			{ username: 'expected', password: 'correct-password' },
			compare,
		);
		const authorization = `Basic ${Buffer.from('rejectxx:correct-password').toString('base64')}`;

		expect(validate(authorization)).toBe(false);
		expect(compare).toHaveBeenCalledTimes(2);
		expect(compare.mock.calls.map(([left, right]) => [left.toString(), right.toString()])).toEqual([
			['rejectxx', 'expected'],
			['correct-password', 'correct-password'],
		]);
	});
});
