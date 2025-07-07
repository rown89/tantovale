'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

import { client } from '@workspace/server/client-rpc';
import OrderPreviewCard from '@workspace/ui/components/order-preview-card/index';
import { ORDER_PHASES } from '@workspace/server/enumerated_values';

import { ShippingDialog } from '#components/dialogs/shipping-dialog';
import { useAuth } from '#providers/auth-providers';

export default function UserSellingItemsComponent() {
	const [statusFilter, setStatusFilter] = useState<(typeof ORDER_PHASES)[keyof typeof ORDER_PHASES] | 'all'>('all');
	const [selectedOrder, setSelectedOrder] = useState<OrderType | null>(null);

	const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
	const [isShippingDialogOpen, setIsShippingDialogOpen] = useState(false);

	const { user } = useAuth();

	const { data: orders = [], isLoading: isOrdersLoading } = useQuery({
		queryKey: ['orders', statusFilter],
		queryFn: async () => {
			const userOrderListResponse = await client.orders.auth.status[':status'].$get({
				param: {
					status: statusFilter,
				},
			});

			if (!userOrderListResponse.ok) {
				toast.error('Error fetching orders');
				return [];
			}

			const userOrderList = await userOrderListResponse.json();

			return userOrderList ?? [];
		},
	});

	type OrderType = (typeof orders)[number];

	const handleCompletePayment = (order: OrderType) => {
		setSelectedOrder(order);
		setIsPaymentDialogOpen(true);
	};

	const handleShipping = (order: OrderType) => {
		setSelectedOrder(order);
		setIsShippingDialogOpen(true);
	};

	// Update the completePayment function to use order status
	const completePayment = () => {
		if (selectedOrder) {
			// Update the order status in the orders array
			// Note: This would typically be handled by a server update
			// and subsequent refetch of orders
			setIsPaymentDialogOpen(false);
			setSelectedOrder(null);
		}
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
								onCompletePayment={() => handleCompletePayment(order)}
								onCancel={() => handleCancel(order)}
								onRequestAssistance={() => handleRequestAssistance(order)}
								onViewShipment={() => handleShipping(order)}
							/>
						</>
					))}

				{orders && orders.length && (
					<>
						{/* TODO: Add payment dialog or redirect to payment page */}

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
