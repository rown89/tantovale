'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { toast } from 'sonner';

import { client } from '@workspace/server/client-rpc';
import OrderPreviewCard from '@workspace/ui/components/order-preview-card/index';
import { ORDER_PHASES } from '@workspace/server/enumerated_values';
import { linkBuilder } from '@workspace/shared/utils/linkBuilder';

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
			<div className='bg-background z-1 sticky top-0 flex items-center justify-between'>
				<div className='w-full space-y-6'>
					<h1 className='text-3xl font-bold'>Orders</h1>

					<p className='text-muted-foreground'>Manage your orders.</p>
				</div>
			</div>

			<div className='grid grid-cols-1 gap-2'>
				{orders &&
					orders.length &&
					orders?.map((order) => (
						<OrderPreviewCard
							key={order.id}
							order={{
								...order,
								item: {
									...order.item,
									itemLink: (
										<h1 className='text-accent overflow-hidden truncate text-ellipsis font-bold hover:underline'>
											<Link
												href={`/item/${linkBuilder({ id: order.item.id, title: order.item.title })}`}
												className='text-xl'>
												{order.item.title}
											</Link>
										</h1>
									),
								},
								seller: {
									...order.seller,
									usernameLink: (
										<Link
											className='text-primary overflow-hidden truncate text-ellipsis hover:underline'
											href={`/user/${order.seller.username}`}>
											{order.seller.username}
										</Link>
									),
								},
							}}
							onCompletePayment={() => handleCompletePayment(order)}
							onCancel={() => handleCancel(order)}
							onRequestAssistance={() => handleRequestAssistance(order)}
							onViewShipment={() => handleShipping(order)}
						/>
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
