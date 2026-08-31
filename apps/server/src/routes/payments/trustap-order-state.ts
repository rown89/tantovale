import {
	entityTrustapTransactionTypeValues as TRUSTAP,
	type EntityTrustapTransactionStatus,
	ORDER_PHASES,
	PAYMENT_CANCELLATION_STATES,
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
const refundEligibleProviderStatuses = new Set<EntityTrustapTransactionStatus>([
	TRUSTAP.PAID,
	TRUSTAP.TRACKED,
	TRUSTAP.DELIVERED,
	TRUSTAP.COMPLAINED,
	TRUSTAP.COMPLAINT_PERIOD_ENDED,
	TRUSTAP.CANCELLED_WITH_PAYMENT,
]);

export function isAuthoritativeCancellationStatus(status: EntityTrustapTransactionStatus): boolean {
	return authoritativeCancellationStatuses.has(status);
}

export function isAuthoritativeCreationResolutionStatus(status: EntityTrustapTransactionStatus): boolean {
	return authoritativeCreationResolutionStatuses.has(status);
}

export type CronCancellationSettlement = {
	orderStatus: OrderPhase | string;
	paymentCancellationState: (typeof PAYMENT_CANCELLATION_STATES)[keyof typeof PAYMENT_CANCELLATION_STATES];
};

export function isReachableOrSameTrustapTransition(
	currentProviderStatus: EntityTrustapTransactionStatus,
	incomingProviderStatus: EntityTrustapTransactionStatus,
	transition: Pick<TrustapOrderTransition, 'apply'>,
): boolean {
	return transition.apply || currentProviderStatus === incomingProviderStatus;
}

/**
 * A provider transition can be reachable while still contradicting an order that
 * has already reached a terminal phase (for example a stale CREATED provider row
 * next to a COMPLETED order receiving PAID). Keep terminal order truth closed
 * unless the provider outcome maps to the same terminal phase, is the cron
 * cancellation outcome for an expired order, or is an authoritative refund
 * reached from a post-payment provider state.
 */
export function isTrustapTransitionCompatibleWithTerminalOrder(
	currentProviderStatus: EntityTrustapTransactionStatus,
	currentOrderStatus: string,
	incomingProviderStatus: EntityTrustapTransactionStatus,
	currentCancellationState: string | null,
	transition: Pick<TrustapOrderTransition, 'apply' | 'orderStatus'>,
): boolean {
	if (!terminalOrderPhases.has(currentOrderStatus)) return true;
	if (incomingProviderStatus === TRUSTAP.COMPLAINED) return transition.orderStatus === currentOrderStatus;

	const incomingOrderStatus = trustapToOrderPhase[incomingProviderStatus as keyof typeof trustapToOrderPhase];
	if (incomingOrderStatus === currentOrderStatus) return true;
	if (
		currentOrderStatus === ORDER_PHASES.EXPIRED &&
		incomingProviderStatus === TRUSTAP.CANCELLED &&
		currentCancellationState !== PAYMENT_CANCELLATION_STATES.NONE
	) {
		return true;
	}
	if (
		incomingOrderStatus === ORDER_PHASES.PAYMENT_REFUNDED &&
		transition.apply &&
		refundEligibleProviderStatuses.has(currentProviderStatus)
	) {
		return true;
	}
	return false;
}

export function resolveCronCancellationSettlement(
	currentCancellationState: string | null,
	currentProviderStatus: EntityTrustapTransactionStatus,
	incomingProviderStatus: EntityTrustapTransactionStatus,
	transition: Pick<TrustapOrderTransition, 'apply' | 'orderStatus'>,
): CronCancellationSettlement | undefined {
	if (
		currentCancellationState !== PAYMENT_CANCELLATION_STATES.CANCELLING &&
		currentCancellationState !== PAYMENT_CANCELLATION_STATES.RECONCILIATION_REQUIRED
	) {
		return undefined;
	}
	if (incomingProviderStatus === TRUSTAP.CREATED || incomingProviderStatus === TRUSTAP.JOINED) return undefined;
	// A durable cron marker must not make an otherwise unreachable provider edge valid.
	// Same-status replays are intentionally accepted so a webhook or poll can settle an
	// intent left behind by a crash after the provider state was already persisted.
	if (!isReachableOrSameTrustapTransition(currentProviderStatus, incomingProviderStatus, transition)) return undefined;
	if (incomingProviderStatus === TRUSTAP.CANCELLED) {
		return {
			orderStatus: ORDER_PHASES.EXPIRED,
			paymentCancellationState: PAYMENT_CANCELLATION_STATES.CANCELLED,
		};
	}
	return {
		orderStatus: transition.orderStatus,
		paymentCancellationState: isAuthoritativeCancellationStatus(incomingProviderStatus)
			? PAYMENT_CANCELLATION_STATES.CANCELLED
			: PAYMENT_CANCELLATION_STATES.NONE,
	};
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
