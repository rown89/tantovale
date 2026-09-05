export type ProviderOperationWindow = {
	operation: string;
	startedAt: number;
	endedAt: number;
};

function nextBusinessDay(timestamp: number): string {
	const date = new Date(timestamp);
	date.setUTCDate(date.getUTCDate() + 1);
	while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() + 1);
	date.setUTCHours(12, 0, 0, 0);
	return date.toISOString();
}

export function assertShipmentDateIsNextBusinessDay(
	shipmentDate: unknown,
	operationWindow: ProviderOperationWindow,
): void {
	const { operation, startedAt, endedAt } = operationWindow;
	if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt) {
		throw new Error(`Invalid ${operation} time window`);
	}
	if (typeof shipmentDate !== 'string') {
		throw new Error(`${operation} shipment_date must be an ISO timestamp`);
	}
	const shipmentTimestamp = Date.parse(shipmentDate);
	if (!Number.isFinite(shipmentTimestamp) || new Date(shipmentTimestamp).toISOString() !== shipmentDate) {
		throw new Error(`${operation} shipment_date must be an exact ISO timestamp`);
	}
	const expectedDates = new Set([nextBusinessDay(startedAt), nextBusinessDay(endedAt)]);
	if (!expectedDates.has(shipmentDate)) {
		throw new Error(`${operation} shipment_date must be the next UTC business day at 12:00`);
	}
}
