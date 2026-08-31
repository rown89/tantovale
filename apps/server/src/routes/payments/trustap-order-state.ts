import {
	entityTrustapTransactionTypeValues,
	type EntityTrustapTransactionStatus,
	ORDER_PHASES,
} from '#database/schemas/enumerated_values';

type OrderPhase = (typeof ORDER_PHASES)[keyof typeof ORDER_PHASES];

const orderPhaseByTrustapStatus: Record<EntityTrustapTransactionStatus, OrderPhase> = {
	[entityTrustapTransactionTypeValues.CREATED]: ORDER_PHASES.PAYMENT_PENDING,
	[entityTrustapTransactionTypeValues.JOINED]: ORDER_PHASES.PAYMENT_PENDING,
	[entityTrustapTransactionTypeValues.PAID]: ORDER_PHASES.PAYMENT_CONFIRMED,
	[entityTrustapTransactionTypeValues.TRACKED]: ORDER_PHASES.SHIPPING_PENDING,
	[entityTrustapTransactionTypeValues.DELIVERED]: ORDER_PHASES.SHIPPING_CONFIRMED,
	[entityTrustapTransactionTypeValues.COMPLAINED]: ORDER_PHASES.SHIPPING_CONFIRMED,
	[entityTrustapTransactionTypeValues.COMPLAINT_PERIOD_ENDED]: ORDER_PHASES.SHIPPING_CONFIRMED,
	[entityTrustapTransactionTypeValues.FUNDS_RELEASED]: ORDER_PHASES.COMPLETED,
	[entityTrustapTransactionTypeValues.REJECTED]: ORDER_PHASES.CANCELLED,
	[entityTrustapTransactionTypeValues.CANCELLED]: ORDER_PHASES.CANCELLED,
	[entityTrustapTransactionTypeValues.CANCELLED_WITH_PAYMENT]: ORDER_PHASES.PAYMENT_REFUNDED,
	[entityTrustapTransactionTypeValues.PAYMENT_REFUNDED]: ORDER_PHASES.PAYMENT_REFUNDED,
};

const activeTrustapRank: Partial<Record<EntityTrustapTransactionStatus, number>> = {
	[entityTrustapTransactionTypeValues.CREATED]: 0,
	[entityTrustapTransactionTypeValues.JOINED]: 1,
	[entityTrustapTransactionTypeValues.PAID]: 2,
	[entityTrustapTransactionTypeValues.TRACKED]: 3,
	[entityTrustapTransactionTypeValues.DELIVERED]: 4,
	[entityTrustapTransactionTypeValues.COMPLAINED]: 5,
	[entityTrustapTransactionTypeValues.COMPLAINT_PERIOD_ENDED]: 6,
	[entityTrustapTransactionTypeValues.FUNDS_RELEASED]: 7,
};

const activeOrderRank: Partial<Record<OrderPhase, number>> = {
	[ORDER_PHASES.PAYMENT_PENDING]: 0,
	[ORDER_PHASES.PAYMENT_CONFIRMED]: 1,
	[ORDER_PHASES.SHIPPING_PENDING]: 2,
	[ORDER_PHASES.SHIPPING_CONFIRMED]: 3,
	[ORDER_PHASES.COMPLETED]: 4,
};

const terminalOrderPhases = new Set<OrderPhase>([
	ORDER_PHASES.PAYMENT_FAILED,
	ORDER_PHASES.PAYMENT_REFUNDED,
	ORDER_PHASES.COMPLETED,
	ORDER_PHASES.CANCELLED,
	ORDER_PHASES.EXPIRED,
]);

const terminalTrustapStatuses = new Set<EntityTrustapTransactionStatus>([
	entityTrustapTransactionTypeValues.REJECTED,
	entityTrustapTransactionTypeValues.CANCELLED,
	entityTrustapTransactionTypeValues.CANCELLED_WITH_PAYMENT,
	entityTrustapTransactionTypeValues.PAYMENT_REFUNDED,
	entityTrustapTransactionTypeValues.FUNDS_RELEASED,
]);

export type TrustapOrderTransition = {
	apply: boolean;
	orderStatus: OrderPhase;
	providerStatus: EntityTrustapTransactionStatus;
};

export function resolveTrustapOrderTransition(
	currentProviderStatus: EntityTrustapTransactionStatus,
	currentOrderStatus: string,
	incomingProviderStatus: EntityTrustapTransactionStatus,
): TrustapOrderTransition {
	const nextOrderStatus = orderPhaseByTrustapStatus[incomingProviderStatus];
	const currentOrder = currentOrderStatus as OrderPhase;
	if (currentProviderStatus === incomingProviderStatus) {
		return { apply: false, orderStatus: currentOrder, providerStatus: currentProviderStatus };
	}
	if (
		currentProviderStatus === entityTrustapTransactionTypeValues.CANCELLED_WITH_PAYMENT &&
		incomingProviderStatus === entityTrustapTransactionTypeValues.PAYMENT_REFUNDED &&
		currentOrder === ORDER_PHASES.PAYMENT_REFUNDED
	) {
		return {
			apply: true,
			orderStatus: ORDER_PHASES.PAYMENT_REFUNDED,
			providerStatus: entityTrustapTransactionTypeValues.PAYMENT_REFUNDED,
		};
	}
	if (terminalOrderPhases.has(currentOrder)) {
		return { apply: false, orderStatus: currentOrder, providerStatus: currentProviderStatus };
	}
	if (terminalTrustapStatuses.has(currentProviderStatus)) {
		return { apply: false, orderStatus: currentOrder, providerStatus: currentProviderStatus };
	}

	const currentProviderRank = activeTrustapRank[currentProviderStatus];
	const incomingProviderRank = activeTrustapRank[incomingProviderStatus];
	if (
		currentProviderRank !== undefined &&
		incomingProviderRank !== undefined &&
		incomingProviderRank < currentProviderRank
	) {
		return { apply: false, orderStatus: currentOrder, providerStatus: currentProviderStatus };
	}
	const currentOrderRank = activeOrderRank[currentOrder];
	const nextOrderRank = activeOrderRank[nextOrderStatus];
	if (currentOrderRank !== undefined && nextOrderRank !== undefined && nextOrderRank < currentOrderRank) {
		return { apply: false, orderStatus: currentOrder, providerStatus: currentProviderStatus };
	}

	return { apply: true, orderStatus: nextOrderStatus, providerStatus: incomingProviderStatus };
}
