import { Badge } from '@workspace/ui/components/badge';

export const getStatusBadge = (status: string) => {
	switch (status) {
		case 'payment_pending':
			return (
				<Badge variant='outline' className='border-yellow-200 bg-yellow-50 font-bold text-yellow-700'>
					Pending Payment
				</Badge>
			);
		case 'payment_confirmed':
			return (
				<Badge variant='outline' className='border-blue-200 bg-blue-50 font-bold text-blue-700'>
					Payment Confirmed
				</Badge>
			);
		case 'payment_failed':
			return (
				<Badge variant='outline' className='border-red-200 bg-red-50 font-bold text-red-700'>
					Payment Failed
				</Badge>
			);
		case 'payment_refunded':
			return (
				<Badge variant='outline' className='border-red-200 bg-red-50 font-bold text-red-700'>
					Payment Refunded
				</Badge>
			);
		case 'shipping_pending':
			return (
				<Badge variant='outline' className='border-yellow-200 bg-yellow-50 font-bold text-yellow-700'>
					Shipping Pending
				</Badge>
			);
		case 'shipping_confirmed':
			return (
				<Badge variant='outline' className='border-blue-200 bg-blue-50 font-bold text-blue-700'>
					Shipping Confirmed
				</Badge>
			);
		case 'completed':
			return (
				<Badge variant='outline' className='border-green-200 bg-green-50 font-bold text-green-700'>
					Completed
				</Badge>
			);
		case 'cancelled':
			return (
				<Badge variant='outline' className='border-red-200 bg-red-50 font-bold text-red-500'>
					Cancelled
				</Badge>
			);
		case 'expired':
			return (
				<Badge variant='outline' className='border-red-200 bg-red-50 font-bold text-red-500'>
					Expired
				</Badge>
			);
		default:
			return <Badge variant='outline'>{status}</Badge>;
	}
};
