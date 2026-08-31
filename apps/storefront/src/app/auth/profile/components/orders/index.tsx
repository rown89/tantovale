'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

import { client } from '@workspace/server/client-rpc';
import OrderPreviewCard from '@workspace/ui/components/order-preview-card/index';
import { ORDER_PHASES } from '@workspace/server/enumerated_values';

import { ShippingDialog } from '#components/dialogs/shipping-dialog';

export default function UserSellingItemsComponent() {
	const statusFilter: (typeof ORDER_PHASES)[keyof typeof ORDER_PHASES] | 'all' = 'all';
	const [selectedOrder, setSelectedOrder] = useState<OrderType | null>(null);

	const [isShippingDialogOpen, setIsShippingDialogOpen] = useState(false);

	const { data: orders = [] } = useQuery({
		queryKey: ['orders', statusFilter],
		queryFn: async () => {
			const userOrderListResponse = await client.orders.auth.status[':status'].$get({
				param: {
					status: statusFilter,
				},
			});

			if (!userOrderListResponse.ok) {
				toast.error('Error fetching orders', {
					description: 'Please try again later.',
					duration: 8000,
				});

				return [];
			}

			const userOrderList = await userOrderListResponse.json();

			return userOrderList ?? [];
		},
	});

	type OrderType = (typeof orders)[number];

	const handleCompletePayment = (order: OrderType) => {
		if (!('payment_url' in order) || typeof order.payment_url !== 'string') {
			toast.error('Payment link unavailable', {
				description: 'Refresh the order or try again later.',
			});
			return;
		}
		window.open(order.payment_url, '_blank', 'noopener,noreferrer');
	};

	const handleShipping = (order: OrderType) => {
		setSelectedOrder(order);
		setIsShippingDialogOpen(true);
	};

	const completeShipping = () => {
		if (selectedOrder) {
			setIsShippingDialogOpen(false);
			setSelectedOrder(null);
		}
	};

	const handleCancel = (order: OrderType) => {
		console.log('cancel', order);
	};

	const handleRequestAssistance = (order: OrderType) => {
		console.log('request assistance', order);
	};

	return (
		<div className='flex w-full flex-col gap-7 overflow-auto px-4'>
			<div className='flex flex-col gap-4 space-y-6'>
				{orders &&
					orders.length &&
					orders?.map((order) => (
						<>
							<OrderPreviewCard
								order={order}
								onCompletePayment={
									'payment_url' in order && typeof order.payment_url === 'string'
										? () => handleCompletePayment(order)
										: undefined
								}
								onCancel={() => handleCancel(order)}
								onRequestAssistance={() => handleRequestAssistance(order)}
								onViewShipment={() => handleShipping(order)}
							/>
						</>
					))}

				{orders && orders.length && (
					<>
						<ShippingDialog
							isOpen={isShippingDialogOpen}
							setIsOpen={setIsShippingDialogOpen}
							order={selectedOrder}
							onShippingComplete={completeShipping}
						/>
					</>
				)}
			</div>
		</div>
	);
}
