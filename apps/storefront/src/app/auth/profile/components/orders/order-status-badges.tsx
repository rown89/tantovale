import { ORDER_PHASES } from '@workspace/server/enumerated_values';
import { Badge } from '@workspace/ui/components/badge';

export const getStatusBadge = (status: string) => {
	switch (status) {
		case ORDER_PHASES.PAYMENT_PENDING:
			return (
				<Badge variant='outline' className='border-yellow-200 bg-yellow-50 font-bold text-yellow-700'>
					Pending Payment
				</Badge>
			);
		case ORDER_PHASES.PAYMENT_CONFIRMED:
			return (
				<Badge variant='outline' className='border-blue-200 bg-blue-50 font-bold text-blue-700'>
					Payment Confirmed
				</Badge>
			);
		case ORDER_PHASES.PAYMENT_FAILED:
			return (
				<Badge variant='outline' className='border-red-200 bg-red-50 font-bold text-red-700'>
					Payment Failed
				</Badge>
			);
		case ORDER_PHASES.PAYMENT_REFUNDED:
			return (
				<Badge variant='outline' className='border-red-200 bg-red-50 font-bold text-red-700'>
					Payment Refunded
				</Badge>
			);
		case ORDER_PHASES.SHIPPING_PENDING:
			return (
				<Badge variant='outline' className='border-yellow-200 bg-yellow-50 font-bold text-yellow-700'>
					Shipping Pending
				</Badge>
			);
		case ORDER_PHASES.SHIPPING_CONFIRMED:
			return (
				<Badge variant='outline' className='border-blue-200 bg-blue-50 font-bold text-blue-700'>
					Shipping Confirmed
				</Badge>
			);
		case ORDER_PHASES.COMPLETED:
			return (
				<Badge variant='outline' className='border-green-200 bg-green-50 font-bold text-green-700'>
					Completed
				</Badge>
			);
		case ORDER_PHASES.CANCELLED:
			return (
				<Badge variant='outline' className='border-red-200 bg-red-50 font-bold text-red-500'>
					Cancelled
				</Badge>
			);
		case ORDER_PHASES.EXPIRED:
			return (
				<Badge variant='outline' className='border-red-200 bg-red-50 font-bold text-red-500'>
					Expired
				</Badge>
			);
		default:
			return <Badge variant='outline'>{status}</Badge>;
	}
};
