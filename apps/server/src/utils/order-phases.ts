export const ORDER_PHASES = {
	PAYMENT_PENDING: 'payment_pending',
	PAYMENT_CONFIRMED: 'payment_confirmed',
	PAYMENT_FAILED: 'payment_failed',
	PAYMENT_REFUNDED: 'payment_refunded',
	SHIPPING_PENDING: 'shipping_pending',
	SHIPPING_CONFIRMED: 'shipping_confirmed',
	COMPLETED: 'completed',
	CANCELLED: 'cancelled',
	EXPIRED: 'expired',
} as const;
