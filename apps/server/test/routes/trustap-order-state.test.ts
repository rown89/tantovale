import { describe, expect, it } from 'vitest';

import {
	entityTrustapTransactionTypeValues as TRUSTAP,
	ORDER_PHASES,
	PAYMENT_CANCELLATION_STATES,
} from '../../src/database/schemas/enumerated_values';
import {
	classifyTrustapStatusRelation,
	isReachableOrSameTrustapTransition,
	isTrustapTransitionCompatibleWithTerminalOrder,
	resolveCronCancellationSettlement,
	resolveTrustapOrderTransition,
} from '../../src/routes/payments/trustap-order-state';

const exactMappings = [
	[TRUSTAP.CREATED, ORDER_PHASES.PAYMENT_PENDING],
	[TRUSTAP.JOINED, ORDER_PHASES.PAYMENT_PENDING],
	[TRUSTAP.PAID, ORDER_PHASES.PAYMENT_CONFIRMED],
	[TRUSTAP.REJECTED, ORDER_PHASES.PAYMENT_FAILED],
	[TRUSTAP.CANCELLED, ORDER_PHASES.CANCELLED],
	[TRUSTAP.TRACKED, ORDER_PHASES.SHIPPING_CONFIRMED],
	[TRUSTAP.CANCELLED_WITH_PAYMENT, ORDER_PHASES.PAYMENT_REFUNDED],
	[TRUSTAP.PAYMENT_REFUNDED, ORDER_PHASES.PAYMENT_REFUNDED],
	[TRUSTAP.DELIVERED, ORDER_PHASES.COMPLETED],
	[TRUSTAP.COMPLAINT_PERIOD_ENDED, ORDER_PHASES.COMPLETED],
	[TRUSTAP.FUNDS_RELEASED, ORDER_PHASES.COMPLETED],
] as const;

describe('Trustap order transition policy', () => {
	it('classifies forward, stale, same, and conflicting provider lineage independently', () => {
		expect(classifyTrustapStatusRelation(TRUSTAP.CREATED, TRUSTAP.PAID)).toBe('forward');
		expect(classifyTrustapStatusRelation(TRUSTAP.PAID, TRUSTAP.CREATED)).toBe('stale');
		expect(classifyTrustapStatusRelation(TRUSTAP.PAID, TRUSTAP.PAID)).toBe('same');
		expect(classifyTrustapStatusRelation(TRUSTAP.REJECTED, TRUSTAP.CANCELLED)).toBe('conflict');
	});

	it('accepts only a reachable transition or an exact persisted provider replay', () => {
		expect(isReachableOrSameTrustapTransition(TRUSTAP.CREATED, TRUSTAP.PAID, { apply: true })).toBe(true);
		expect(isReachableOrSameTrustapTransition(TRUSTAP.REJECTED, TRUSTAP.REJECTED, { apply: false })).toBe(true);
		expect(isReachableOrSameTrustapTransition(TRUSTAP.REJECTED, TRUSTAP.CANCELLED, { apply: false })).toBe(false);
	});

	const cronSettlementMatrix = [
		[TRUSTAP.CREATED, undefined],
		[TRUSTAP.JOINED, undefined],
		[
			TRUSTAP.PAID,
			{
				orderStatus: ORDER_PHASES.PAYMENT_CONFIRMED,
				paymentCancellationState: PAYMENT_CANCELLATION_STATES.NONE,
			},
		],
		[
			TRUSTAP.REJECTED,
			{
				orderStatus: ORDER_PHASES.PAYMENT_FAILED,
				paymentCancellationState: PAYMENT_CANCELLATION_STATES.CANCELLED,
			},
		],
		[
			TRUSTAP.CANCELLED,
			{
				orderStatus: ORDER_PHASES.EXPIRED,
				paymentCancellationState: PAYMENT_CANCELLATION_STATES.CANCELLED,
			},
		],
		[
			TRUSTAP.TRACKED,
			{
				orderStatus: ORDER_PHASES.SHIPPING_CONFIRMED,
				paymentCancellationState: PAYMENT_CANCELLATION_STATES.NONE,
			},
		],
		[
			TRUSTAP.CANCELLED_WITH_PAYMENT,
			{
				orderStatus: ORDER_PHASES.PAYMENT_REFUNDED,
				paymentCancellationState: PAYMENT_CANCELLATION_STATES.CANCELLED,
			},
		],
		[
			TRUSTAP.PAYMENT_REFUNDED,
			{
				orderStatus: ORDER_PHASES.PAYMENT_REFUNDED,
				paymentCancellationState: PAYMENT_CANCELLATION_STATES.CANCELLED,
			},
		],
		[
			TRUSTAP.DELIVERED,
			{
				orderStatus: ORDER_PHASES.COMPLETED,
				paymentCancellationState: PAYMENT_CANCELLATION_STATES.NONE,
			},
		],
		[
			TRUSTAP.COMPLAINED,
			{
				orderStatus: ORDER_PHASES.COMPLETED,
				paymentCancellationState: PAYMENT_CANCELLATION_STATES.NONE,
			},
		],
		[
			TRUSTAP.COMPLAINT_PERIOD_ENDED,
			{
				orderStatus: ORDER_PHASES.COMPLETED,
				paymentCancellationState: PAYMENT_CANCELLATION_STATES.NONE,
			},
		],
		[
			TRUSTAP.FUNDS_RELEASED,
			{
				orderStatus: ORDER_PHASES.COMPLETED,
				paymentCancellationState: PAYMENT_CANCELLATION_STATES.NONE,
			},
		],
	] as const;

	it.each([PAYMENT_CANCELLATION_STATES.CANCELLING, PAYMENT_CANCELLATION_STATES.RECONCILIATION_REQUIRED])(
		'settles every authoritative provider outcome for a durable %s cron intent',
		(cancellationState) => {
			for (const [providerStatus, expected] of cronSettlementMatrix) {
				const currentOrderStatus =
					providerStatus === TRUSTAP.COMPLAINED
						? ORDER_PHASES.COMPLETED
						: (exactMappings.find(([status]) => status === providerStatus)?.[1] ?? ORDER_PHASES.COMPLETED);
				const transition = resolveTrustapOrderTransition(providerStatus, currentOrderStatus, providerStatus);
				expect(
					resolveCronCancellationSettlement(cancellationState, providerStatus, providerStatus, transition),
				).toEqual(expected);
			}
		},
	);

	it('does not reinterpret orders without a durable cron cancellation intent', () => {
		expect(
			resolveCronCancellationSettlement(PAYMENT_CANCELLATION_STATES.NONE, TRUSTAP.CANCELLED, TRUSTAP.CANCELLED, {
				apply: false,
				orderStatus: ORDER_PHASES.CANCELLED,
			}),
		).toBeUndefined();
	});

	it('does not let a cron marker authorize an unreachable terminal branch', () => {
		const transition = resolveTrustapOrderTransition(TRUSTAP.REJECTED, ORDER_PHASES.PAYMENT_FAILED, TRUSTAP.CANCELLED);

		expect(
			resolveCronCancellationSettlement(
				PAYMENT_CANCELLATION_STATES.RECONCILIATION_REQUIRED,
				TRUSTAP.REJECTED,
				TRUSTAP.CANCELLED,
				transition,
			),
		).toBeUndefined();
	});

	it.each(exactMappings)('maps %s exactly to %s', (providerStatus, orderStatus) => {
		const transition = resolveTrustapOrderTransition(TRUSTAP.CREATED, ORDER_PHASES.PAYMENT_PENDING, providerStatus);

		expect(transition.orderStatus).toBe(orderStatus);
	});

	it('preserves a valid order phase when Trustap reports complained', () => {
		const transition = resolveTrustapOrderTransition(
			TRUSTAP.DELIVERED,
			ORDER_PHASES.SHIPPING_CONFIRMED,
			TRUSTAP.COMPLAINED,
		);

		expect(transition).toEqual({
			apply: true,
			orderStatus: ORDER_PHASES.SHIPPING_CONFIRMED,
			providerStatus: TRUSTAP.COMPLAINED,
		});
	});

	it.each([
		[TRUSTAP.PAID, ORDER_PHASES.PAYMENT_CONFIRMED, TRUSTAP.CANCELLED],
		[TRUSTAP.TRACKED, ORDER_PHASES.SHIPPING_CONFIRMED, TRUSTAP.REJECTED],
		[TRUSTAP.FUNDS_RELEASED, ORDER_PHASES.COMPLETED, TRUSTAP.PAID],
	] as const)('rejects illegal transition %s -> %s', (currentProvider, currentOrder, incomingProvider) => {
		expect(resolveTrustapOrderTransition(currentProvider, currentOrder, incomingProvider)).toEqual({
			apply: false,
			orderStatus: currentOrder,
			providerStatus: currentProvider,
		});
	});

	it('repairs an invalid legacy order phase on a same-status provider replay', () => {
		expect(resolveTrustapOrderTransition(TRUSTAP.PAID, 'paid', TRUSTAP.PAID)).toEqual({
			apply: true,
			orderStatus: ORDER_PHASES.PAYMENT_CONFIRMED,
			providerStatus: TRUSTAP.PAID,
		});
	});

	it.each([
		[TRUSTAP.CANCELLED, ORDER_PHASES.EXPIRED],
		[TRUSTAP.PAID, ORDER_PHASES.SHIPPING_CONFIRMED],
		[TRUSTAP.COMPLAINED, ORDER_PHASES.COMPLETED],
	] as const)('does not regress a valid order on duplicate %s', (providerStatus, orderStatus) => {
		expect(resolveTrustapOrderTransition(providerStatus, orderStatus, providerStatus)).toEqual({
			apply: false,
			orderStatus,
			providerStatus,
		});
	});

	it('permits the documented complained to payment_refunded transition', () => {
		expect(
			resolveTrustapOrderTransition(TRUSTAP.COMPLAINED, ORDER_PHASES.SHIPPING_CONFIRMED, TRUSTAP.PAYMENT_REFUNDED),
		).toEqual({
			apply: true,
			orderStatus: ORDER_PHASES.PAYMENT_REFUNDED,
			providerStatus: TRUSTAP.PAYMENT_REFUNDED,
		});
	});

	it('applies an authoritative refund after delivered even when the order is already completed', () => {
		expect(resolveTrustapOrderTransition(TRUSTAP.DELIVERED, ORDER_PHASES.COMPLETED, TRUSTAP.PAYMENT_REFUNDED)).toEqual({
			apply: true,
			orderStatus: ORDER_PHASES.PAYMENT_REFUNDED,
			providerStatus: TRUSTAP.PAYMENT_REFUNDED,
		});
	});

	it('rejects a reachable provider status that contradicts an already terminal order', () => {
		const transition = resolveTrustapOrderTransition(TRUSTAP.CREATED, ORDER_PHASES.COMPLETED, TRUSTAP.PAID);

		expect(
			isTrustapTransitionCompatibleWithTerminalOrder(
				TRUSTAP.CREATED,
				ORDER_PHASES.COMPLETED,
				TRUSTAP.PAID,
				PAYMENT_CANCELLATION_STATES.RECONCILIATION_REQUIRED,
				transition,
			),
		).toBe(false);
	});

	it.each([
		[TRUSTAP.DELIVERED, TRUSTAP.FUNDS_RELEASED, ORDER_PHASES.COMPLETED, PAYMENT_CANCELLATION_STATES.NONE],
		[TRUSTAP.CANCELLED, TRUSTAP.CANCELLED, ORDER_PHASES.EXPIRED, PAYMENT_CANCELLATION_STATES.CANCELLED],
		[TRUSTAP.DELIVERED, TRUSTAP.PAYMENT_REFUNDED, ORDER_PHASES.COMPLETED, PAYMENT_CANCELLATION_STATES.NONE],
	] as const)(
		'permits compatible terminal provider evidence %s -> %s',
		(current, incoming, orderStatus, cancellation) => {
			const transition = resolveTrustapOrderTransition(current, orderStatus, incoming);
			expect(
				isTrustapTransitionCompatibleWithTerminalOrder(current, orderStatus, incoming, cancellation, transition),
			).toBe(true);
		},
	);
});
