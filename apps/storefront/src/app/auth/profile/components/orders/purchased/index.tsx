'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

import { client } from '@workspace/server/client-rpc';
import OrderPreviewCard from '@workspace/ui/components/order-preview-card/index';
import { ORDER_PHASES } from '@workspace/server/enumerated_values';
import { linkBuilder } from '@workspace/shared/utils/linkBuilder';

import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogDescription,
	DialogTitle,
	DialogFooter,
	DialogClose,
} from '@workspace/ui/components/dialog';
import { Button } from '@workspace/ui/components/button';

import { ShippingDialog } from '#components/dialogs/shipping-dialog';

export default function PurchasedOrdersComponent() {
	const [statusFilter, setStatusFilter] = useState<(typeof ORDER_PHASES)[keyof typeof ORDER_PHASES] | 'all'>('all');
	const [selectedOrder, setSelectedOrder] = useState<OrderType | null>(null);
	const router = useRouter();

	const [isCancelOrderDialogOpen, setIsCancelOrderDialogOpen] = useState(false);
	const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
	const [isShippingDialogOpen, setIsShippingDialogOpen] = useState(false);

	const {
		data: orders = [],
		isLoading: isOrdersLoading,
		isError: isOrdersError,
	} = useQuery({
		queryKey: ['orders', statusFilter],
		queryFn: async () => {
			const userOrderListResponse = await client.orders.auth.purchased[':status'].$get({
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
		router.push(order.buyer.payment_url);
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
		setSelectedOrder(order);
		setIsCancelOrderDialogOpen(true);
	};

	const handleRequestAssistance = (order: OrderType) => {
		console.log('request assistance', order);
	};

	const ordersArePrintable = orders.length > 0 && !isOrdersLoading && !isOrdersError;

	return (
		<div className='flex flex-col gap-4'>
			{!isOrdersLoading && !isOrdersError && orders.length === 0 && <p>No orders found</p>}

			{isOrdersLoading && <p>Loading...</p>}

			{!isOrdersLoading && isOrdersError && <p>Error fetching orders</p>}

			<div className='grid grid-cols-1 gap-2'>
				{ordersArePrintable &&
					orders.map((order) => (
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
												className='text-md'>
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
			</div>

			{ordersArePrintable && (
				<>
					{/* TODO: Add payment dialog or redirect to payment page */}

					{/* Cancel Order Dialog */}
					<Dialog open={isCancelOrderDialogOpen} onOpenChange={setIsCancelOrderDialogOpen}>
						<DialogContent>
							<DialogClose />
							<DialogHeader>
								<DialogTitle>Cancel Order</DialogTitle>
							</DialogHeader>
							<DialogDescription>
								Are you sure you want to cancel this order for the item:{' '}
								<span className='font-bold'>{selectedOrder?.item.title}</span>?
							</DialogDescription>
							<DialogFooter>
								<Button onClick={() => setIsCancelOrderDialogOpen(false)} variant='default'>
									Confirm
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>

					{/* Shipping Dialog */}
					<ShippingDialog
						isOpen={isShippingDialogOpen}
						setIsOpen={setIsShippingDialogOpen}
						order={selectedOrder}
						onShippingComplete={completeShipping}
					/>
				</>
			)}
		</div>
	);
}
