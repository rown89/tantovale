const POSTGRES_INT32_MAX = 2_147_483_647;

export function parsePositivePostgresInt(value: string): number | null {
	const parsedValue = Number(value);

	if (
		!Number.isFinite(parsedValue) ||
		!Number.isSafeInteger(parsedValue) ||
		parsedValue <= 0 ||
		parsedValue > POSTGRES_INT32_MAX
	) {
		return null;
	}

	return parsedValue;
}
