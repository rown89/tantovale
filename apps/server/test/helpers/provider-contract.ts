export type ProviderOperationWindow = {
	operation: string;
	startedAt: number;
	endedAt: number;
};

export function assertShipmentDateWithinWindow(shipmentDate: unknown, operationWindow: ProviderOperationWindow): void {
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
	if (shipmentTimestamp < startedAt || shipmentTimestamp > endedAt) {
		throw new Error(`${operation} shipment_date must be generated during the API operation`);
	}
}
