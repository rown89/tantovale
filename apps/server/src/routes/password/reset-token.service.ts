import { createClient } from '../../database';
import { verify } from 'hono/jwt';

type ResetTokenClaims = {
	id: number;
	email: string;
	exp: number;
	jti: string;
};

function validateResetTokenClaims(payload: Awaited<ReturnType<typeof verify>>): ResetTokenClaims | undefined {
	if (
		!Number.isSafeInteger(payload.id) ||
		typeof payload.email !== 'string' ||
		payload.email.length === 0 ||
		typeof payload.exp !== 'number' ||
		!Number.isFinite(payload.exp) ||
		payload.exp * 1_000 <= Date.now() ||
		typeof payload.jti !== 'string' ||
		payload.jti.length === 0
	) {
		return undefined;
	}

	return payload as ResetTokenClaims;
}

export async function findValidResetToken(token: string) {
	const { db } = createClient();
	const stored = await db.query.password_reset_tokens.findFirst({ where: { token } });

	if (!stored || stored.expires_at.getTime() <= Date.now()) {
		return undefined;
	}

	return stored;
}

export async function findVerifiedResetToken(token: string, secret: string) {
	let payload: Awaited<ReturnType<typeof verify>>;
	try {
		payload = await verify(token, secret);
	} catch {
		return undefined;
	}

	const claims = validateResetTokenClaims(payload);
	if (!claims) {
		return undefined;
	}

	const stored = await findValidResetToken(token);
	if (!stored || stored.user_id !== claims.id) {
		return undefined;
	}

	return stored;
}
