import React from 'react';
import { Badge } from '@workspace/ui/components/badge';
import { enumeratedValues } from '@workspace/shared/server_bridge';

const { ORDER_PHASES } = enumeratedValues;

interface OrderStatusBadgeProps {
	status: (typeof ORDER_PHASES)[keyof typeof ORDER_PHASES];
}

export function OrderStatusBadge({ status }: OrderStatusBadgeProps) {
	const getStatusConfig = (status: OrderStatusBadgeProps['status']) => {
		switch (status) {
			case ORDER_PHASES.PAYMENT_PENDING:
				return { label: 'Payment Pending', variant: 'secondary' as const };
			case ORDER_PHASES.PAYMENT_CONFIRMED:
				return { label: 'Payment Confirmed', variant: 'default' as const };
			case ORDER_PHASES.PAYMENT_FAILED:
				return { label: 'Payment Failed', variant: 'destructive' as const };
			case ORDER_PHASES.PAYMENT_REFUNDED:
				return { label: 'Refunded', variant: 'outline' as const };
			case ORDER_PHASES.SHIPPING_PENDING:
				return { label: 'Shipping Pending', variant: 'secondary' as const };
			case ORDER_PHASES.SHIPPING_CONFIRMED:
				return { label: 'Shipped', variant: 'default' as const };
			case ORDER_PHASES.COMPLETED:
				return { label: 'Completed', variant: 'default' as const };
			case ORDER_PHASES.CANCELLED:
				return { label: 'Cancelled', variant: 'destructive' as const };
			case ORDER_PHASES.EXPIRED:
				return { label: 'Expired', variant: 'destructive' as const };
			default:
				return { label: 'Unknown', variant: 'outline' as const };
		}
	};

	const config = getStatusConfig(status);

	return (
		<Badge variant={config.variant} className='text-slate-900'>
			{config.label}
		</Badge>
	);
}
