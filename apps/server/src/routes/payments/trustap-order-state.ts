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

// Direct provider lifecycle edges. We accept a reachable later state because polling can
// legitimately miss intermediate webhooks, but never infer an edge between terminal branches.
const directSuccessors: Record<EntityTrustapTransactionStatus, readonly EntityTrustapTransactionStatus[]> = {
	[TRUSTAP.CREATED]: [TRUSTAP.JOINED, TRUSTAP.REJECTED, TRUSTAP.CANCELLED],
	[TRUSTAP.JOINED]: [TRUSTAP.PAID, TRUSTAP.REJECTED, TRUSTAP.CANCELLED],
	[TRUSTAP.PAID]: [TRUSTAP.TRACKED, TRUSTAP.CANCELLED_WITH_PAYMENT, TRUSTAP.PAYMENT_REFUNDED],
	[TRUSTAP.TRACKED]: [TRUSTAP.DELIVERED, TRUSTAP.COMPLAINED, TRUSTAP.CANCELLED_WITH_PAYMENT, TRUSTAP.PAYMENT_REFUNDED],
	[TRUSTAP.DELIVERED]: [TRUSTAP.COMPLAINED, TRUSTAP.COMPLAINT_PERIOD_ENDED, TRUSTAP.FUNDS_RELEASED],
	[TRUSTAP.COMPLAINED]: [TRUSTAP.DELIVERED, TRUSTAP.COMPLAINT_PERIOD_ENDED, TRUSTAP.FUNDS_RELEASED],
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
		queue.push(...directSuccessors[candidate]);
	}
	return false;
}

export type TrustapOrderTransition = {
	apply: boolean;
	orderStatus: OrderPhase | string;
	providerStatus: EntityTrustapTransactionStatus;
};

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
	return {
		apply:
			currentProviderStatus !== incomingProviderStatus ||
			!currentOrderIsValid ||
			currentOrderStatus !== nextOrderStatus,
		orderStatus: nextOrderStatus,
		providerStatus: incomingProviderStatus,
	};
}
