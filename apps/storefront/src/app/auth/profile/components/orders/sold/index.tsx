'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';

import { client } from '@workspace/server/client-rpc';
import OrderPreviewCard from '@workspace/ui/components/order-preview-card/index';
import { linkBuilder } from '@workspace/shared/utils/linkBuilder';

import { ShippingDialog } from '#components/dialogs/shipping-dialog';

export default function SoldOrdersComponent() {
	const [isShippingDialogOpen, setIsShippingDialogOpen] = useState(false);
	const [selectedOrder, setSelectedOrder] = useState<OrderType | null>(null);

	const viewShipping = (order: OrderType) => {
		setSelectedOrder(order);
		setIsShippingDialogOpen(true);
	};

	const {
		data: orders = [],
		isLoading: isOrdersLoading,
		isError: isOrdersError,
	} = useQuery({
		queryKey: ['orders'],
		queryFn: async () => {
			const userOrderListResponse = await client.orders.auth.sold[':status'].$get({
				param: {
					status: 'all',
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

	return (
		<div>
			{orders.map((order) => (
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
					showActions={false}
				/>
			))}

			{/* View Shipment Dialog */}
			<ShippingDialog isOpen={isShippingDialogOpen} setIsOpen={setIsShippingDialogOpen} order={selectedOrder} />
		</div>
	);
}
