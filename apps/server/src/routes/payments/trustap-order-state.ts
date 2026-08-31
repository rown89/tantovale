import {
	entityTrustapTransactionTypeValues as TRUSTAP,
	type EntityTrustapTransactionStatus,
	ORDER_PHASES,
} from '#database/schemas/enumerated_values';

export type OrderPhase = (typeof ORDER_PHASES)[keyof typeof ORDER_PHASES];

export const trustapToOrderPhase = {
	[TRUSTAP.CREATED]: ORDER_PHASES.PAYMENT_PENDING,
	[TRUSTAP.JOINED]: ORDER_PHASES.PAYMENT_PENDING,
	[TRUSTAP.PAID]: ORDER_PHASES.PAYMENT_CONFIRMED,
	[TRUSTAP.REJECTED]: ORDER_PHASES.PAYMENT_FAILED,
	[TRUSTAP.CANCELLED]: ORDER_PHASES.CANCELLED,
	[TRUSTAP.TRACKED]: ORDER_PHASES.SHIPPING_CONFIRMED,
	[TRUSTAP.CANCELLED_WITH_PAYMENT]: ORDER_PHASES.PAYMENT_REFUNDED,
	[TRUSTAP.PAYMENT_REFUNDED]: ORDER_PHASES.PAYMENT_REFUNDED,
	[TRUSTAP.DELIVERED]: ORDER_PHASES.COMPLETED,
	[TRUSTAP.COMPLAINT_PERIOD_ENDED]: ORDER_PHASES.COMPLETED,
	[TRUSTAP.FUNDS_RELEASED]: ORDER_PHASES.COMPLETED,
} as const satisfies Partial<Record<EntityTrustapTransactionStatus, OrderPhase>>;

const validOrderPhases = new Set<string>(Object.values(ORDER_PHASES));
const terminalOrderPhases = new Set<string>([
	ORDER_PHASES.PAYMENT_FAILED,
	ORDER_PHASES.PAYMENT_REFUNDED,
	ORDER_PHASES.COMPLETED,
	ORDER_PHASES.CANCELLED,
	ORDER_PHASES.EXPIRED,
]);
const activeOrderPhaseRank: Partial<Record<OrderPhase, number>> = {
	[ORDER_PHASES.PAYMENT_PENDING]: 1,
	[ORDER_PHASES.PAYMENT_CONFIRMED]: 2,
	[ORDER_PHASES.SHIPPING_PENDING]: 3,
	[ORDER_PHASES.SHIPPING_CONFIRMED]: 4,
};

function shouldRepairOrderStatus(current: string, expected: OrderPhase): boolean {
	if (!validOrderPhases.has(current)) return true;
	if (current === expected) return false;
	if (expected === ORDER_PHASES.PAYMENT_REFUNDED) return true;
	if (terminalOrderPhases.has(current)) return false;
	if (terminalOrderPhases.has(expected)) return true;
	return (
		(activeOrderPhaseRank[current as OrderPhase] ?? Number.POSITIVE_INFINITY) <
		(activeOrderPhaseRank[expected] ?? Number.POSITIVE_INFINITY)
	);
}

// Direct provider lifecycle edges. We accept a reachable later state because polling can
// legitimately miss intermediate webhooks, but never infer an edge between terminal branches.
const directSuccessors: Record<EntityTrustapTransactionStatus, readonly EntityTrustapTransactionStatus[]> = {
	[TRUSTAP.CREATED]: [TRUSTAP.JOINED, TRUSTAP.REJECTED, TRUSTAP.CANCELLED],
	[TRUSTAP.JOINED]: [TRUSTAP.PAID, TRUSTAP.REJECTED, TRUSTAP.CANCELLED],
	[TRUSTAP.PAID]: [TRUSTAP.TRACKED, TRUSTAP.CANCELLED_WITH_PAYMENT, TRUSTAP.PAYMENT_REFUNDED],
	[TRUSTAP.TRACKED]: [TRUSTAP.DELIVERED, TRUSTAP.COMPLAINED, TRUSTAP.CANCELLED_WITH_PAYMENT, TRUSTAP.PAYMENT_REFUNDED],
	[TRUSTAP.DELIVERED]: [
		TRUSTAP.COMPLAINED,
		TRUSTAP.COMPLAINT_PERIOD_ENDED,
		TRUSTAP.FUNDS_RELEASED,
		TRUSTAP.PAYMENT_REFUNDED,
	],
	[TRUSTAP.COMPLAINED]: [
		TRUSTAP.DELIVERED,
		TRUSTAP.COMPLAINT_PERIOD_ENDED,
		TRUSTAP.FUNDS_RELEASED,
		TRUSTAP.CANCELLED,
		TRUSTAP.CANCELLED_WITH_PAYMENT,
		TRUSTAP.PAYMENT_REFUNDED,
	],
	[TRUSTAP.COMPLAINT_PERIOD_ENDED]: [TRUSTAP.FUNDS_RELEASED],
	[TRUSTAP.CANCELLED_WITH_PAYMENT]: [TRUSTAP.PAYMENT_REFUNDED],
	[TRUSTAP.REJECTED]: [],
	[TRUSTAP.CANCELLED]: [],
	[TRUSTAP.PAYMENT_REFUNDED]: [],
	[TRUSTAP.FUNDS_RELEASED]: [],
};

function isReachable(current: EntityTrustapTransactionStatus, incoming: EntityTrustapTransactionStatus): boolean {
	if (current === incoming) return true;
	const visited = new Set<EntityTrustapTransactionStatus>([current]);
	const queue = [...directSuccessors[current]];
	while (queue.length > 0) {
		const candidate = queue.shift();
		if (!candidate || visited.has(candidate)) continue;
		if (candidate === incoming) return true;
		visited.add(candidate);
		// A refund after a complaint is documented, but it must be observed from
		// the complained state itself rather than inferred from an earlier event.
		if (candidate === TRUSTAP.COMPLAINED && current !== TRUSTAP.COMPLAINED) continue;
		queue.push(...directSuccessors[candidate]);
	}
	return false;
}

export type TrustapOrderTransition = {
	apply: boolean;
	orderStatus: OrderPhase | string;
	providerStatus: EntityTrustapTransactionStatus;
};

const authoritativeCancellationStatuses = new Set<EntityTrustapTransactionStatus>([
	TRUSTAP.REJECTED,
	TRUSTAP.CANCELLED,
	TRUSTAP.CANCELLED_WITH_PAYMENT,
	TRUSTAP.PAYMENT_REFUNDED,
]);
const authoritativeCreationResolutionStatuses = new Set<EntityTrustapTransactionStatus>([
	TRUSTAP.REJECTED,
	TRUSTAP.CANCELLED,
	TRUSTAP.CANCELLED_WITH_PAYMENT,
	TRUSTAP.PAYMENT_REFUNDED,
	TRUSTAP.COMPLAINT_PERIOD_ENDED,
	TRUSTAP.FUNDS_RELEASED,
]);

export function isAuthoritativeCancellationStatus(status: EntityTrustapTransactionStatus): boolean {
	return authoritativeCancellationStatuses.has(status);
}

export function isAuthoritativeCreationResolutionStatus(status: EntityTrustapTransactionStatus): boolean {
	return authoritativeCreationResolutionStatuses.has(status);
}

export function resolveTrustapOrderTransition(
	currentProviderStatus: EntityTrustapTransactionStatus,
	currentOrderStatus: string,
	incomingProviderStatus: EntityTrustapTransactionStatus,
): TrustapOrderTransition {
	const currentOrderIsValid = validOrderPhases.has(currentOrderStatus);
	if (!isReachable(currentProviderStatus, incomingProviderStatus)) {
		return { apply: false, orderStatus: currentOrderStatus, providerStatus: currentProviderStatus };
	}

	if (incomingProviderStatus === TRUSTAP.COMPLAINED) {
		const repairedOrder = currentOrderIsValid
			? currentOrderStatus
			: (trustapToOrderPhase[currentProviderStatus as keyof typeof trustapToOrderPhase] ??
				ORDER_PHASES.PAYMENT_PENDING);
		return {
			apply: currentProviderStatus !== incomingProviderStatus || repairedOrder !== currentOrderStatus,
			orderStatus: repairedOrder,
			providerStatus: incomingProviderStatus,
		};
	}

	const nextOrderStatus = trustapToOrderPhase[incomingProviderStatus as keyof typeof trustapToOrderPhase];
	if (!nextOrderStatus) {
		return { apply: false, orderStatus: currentOrderStatus, providerStatus: currentProviderStatus };
	}
	const repairOrder = shouldRepairOrderStatus(currentOrderStatus, nextOrderStatus);
	return {
		apply: currentProviderStatus !== incomingProviderStatus || repairOrder,
		orderStatus: repairOrder ? nextOrderStatus : currentOrderStatus,
		providerStatus: incomingProviderStatus,
	};
}
