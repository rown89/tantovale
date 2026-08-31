import { describe, expect, it } from 'vitest';

import {
	entityTrustapTransactionTypeValues as TRUSTAP,
	ORDER_PHASES,
} from '../../src/database/schemas/enumerated_values';
import { resolveTrustapOrderTransition } from '../../src/routes/payments/trustap-order-state';

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
		[TRUSTAP.DELIVERED, ORDER_PHASES.COMPLETED, TRUSTAP.PAYMENT_REFUNDED],
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
});
