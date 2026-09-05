import { z } from 'zod/v4';

export const BCRYPT_MAX_PASSWORD_BYTES = 72;

export function isPasswordWithinBcryptByteLimit(password: string): boolean {
	return new TextEncoder().encode(password).byteLength <= BCRYPT_MAX_PASSWORD_BYTES;
}

export const passwordSchema = z
	.string()
	.min(8, 'La password deve contenere almeno 8 caratteri')
	.max(100)
	.nonempty()
	.refine(isPasswordWithinBcryptByteLimit, 'Password must not exceed 72 UTF-8 bytes');
