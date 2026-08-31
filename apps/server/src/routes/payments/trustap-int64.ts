const maxSignedInt64 = 9_223_372_036_854_775_807n;

export type TrustapId = string;

export function canonicalTrustapId(value: unknown): TrustapId | undefined {
	if (typeof value === 'number') {
		if (!Number.isSafeInteger(value) || value <= 0) return undefined;
		return String(value);
	}
	if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return undefined;
	const integer = BigInt(value);
	return integer <= maxSignedInt64 ? value : undefined;
}

export function publicTrustapId(value: TrustapId): number | string {
	const integer = BigInt(value);
	return integer <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value;
}

function topLevelIntegerToken(source: string, property: string): string | undefined {
	let depth = 0;
	for (let index = 0; index < source.length; index += 1) {
		const character = source[index];
		if (character === '{') {
			depth += 1;
			continue;
		}
		if (character === '}') {
			depth -= 1;
			continue;
		}
		if (character !== '"') continue;
		const start = index;
		index += 1;
		let escaped = false;
		for (; index < source.length; index += 1) {
			const current = source[index];
			if (escaped) {
				escaped = false;
				continue;
			}
			if (current === '\\') {
				escaped = true;
				continue;
			}
			if (current === '"') break;
		}
		if (depth !== 1) continue;
		let key: unknown;
		try {
			key = JSON.parse(source.slice(start, index + 1));
		} catch {
			return undefined;
		}
		if (key !== property) continue;
		let cursor = index + 1;
		while (/\s/.test(source[cursor] ?? '')) cursor += 1;
		if (source[cursor] !== ':') continue;
		cursor += 1;
		while (/\s/.test(source[cursor] ?? '')) cursor += 1;
		const tokenStart = cursor;
		while (/\d/.test(source[cursor] ?? '')) cursor += 1;
		if (cursor === tokenStart || !/[\s,}]/.test(source[cursor] ?? '')) return undefined;
		return source.slice(tokenStart, cursor);
	}
	return undefined;
}

export function parseJsonWithTopLevelTrustapId(source: string, property: string): unknown {
	const parsed: unknown = JSON.parse(source);
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return parsed;
	const exactId = canonicalTrustapId(topLevelIntegerToken(source, property));
	if (!exactId) return parsed;
	return { ...parsed, [property]: exactId };
}
