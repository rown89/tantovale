export const ORDER_PHASES = {
	PAYMENT_PENDING: 'payment_pending',
	PAYMENT_CONFIRMED: 'payment_confirmed',
	PAYMENT_FAILED: 'payment_failed',
	PAYMENT_REFUNDED: 'payment_refunded',
	SHIPPING_PENDING: 'shipping_pending',
	SHIPPING_CONFIRMED: 'shipping_confirmed',
	SHIPPING_DELIVERED: 'shipping_delivered',
	SHIPPING_FAILED: 'shipping_failed',
	COMPLETED: 'completed',
	COMPLAINED: 'complained',
	CANCELLED: 'cancelled',
	EXPIRED: 'expired',
} as const;
