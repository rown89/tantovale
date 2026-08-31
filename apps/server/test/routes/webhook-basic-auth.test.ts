import { describe, expect, it, vi } from 'vitest';

import { createTrustapBasicAuthorizationValidator } from '../../src/routes/webhooks/basic-auth';

describe('Trustap webhook Basic credential comparison', () => {
	it('rejects canonical Basic payloads without a username/password separator', () => {
		const validate = createTrustapBasicAuthorizationValidator({ username: 'expected', password: 'password' });
		const authorization = `Basic ${Buffer.from('expected-password').toString('base64')}`;

		expect(validate(authorization)).toBe(false);
	});

	it('rejects canonical Base64 that does not decode as valid UTF-8', () => {
		const validate = createTrustapBasicAuthorizationValidator({ username: '\uFFFD(', password: 'password' });
		const invalidUtf8Credentials = Buffer.concat([Buffer.from([0xc3, 0x28]), Buffer.from(':password')]);
		const authorization = `Basic ${invalidUtf8Credentials.toString('base64')}`;

		expect(validate(authorization)).toBe(false);
	});

	it('splits at the first colon so a webhook password may contain colons', () => {
		const validate = createTrustapBasicAuthorizationValidator({ username: 'expected', password: 'part:two' });
		const authorization = `Basic ${Buffer.from('expected:part:two').toString('base64')}`;

		expect(validate(authorization)).toBe(true);
	});

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
