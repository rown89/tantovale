import { createClient } from '../../database';

export async function findValidResetToken(token: string) {
	const { db } = createClient();
	const stored = await db.query.password_reset_tokens.findFirst({ where: { token } });

	if (!stored || stored.expires_at.getTime() <= Date.now()) {
		return undefined;
	}

	return stored;
}
