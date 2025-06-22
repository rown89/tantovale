'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import { CreditCard } from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/ui/components/select';

import { TableHeader, Table, TableRow, TableHead, TableBody, TableCell } from '@workspace/ui/components/table';
import { Button } from '@workspace/ui/components/button';
import { PaymentDialog } from '#components/dialogs/pay-dialog';
import { client } from '@workspace/server/client-rpc';
import { formatPrice } from '@workspace/ui/lib/utils';
import { linkBuilder } from '@workspace/shared/utils/linkBuilder';
import { getStatusBadge } from './order-status-badges';
import { ShippingDialog } from '#components/dialogs/shipping-dialog';
import { Spinner } from '@workspace/ui/components/spinner';
import { Label } from '@workspace/ui/components/label';

type OrderStatus =
	| 'payment_pending'
	| 'payment_confirmed'
	| 'payment_failed'
	| 'payment_refunded'
	| 'shipping_pending'
	| 'shipping_confirmed'
	| 'completed'
	| 'cancelled'
	| 'expired'
	| 'all';

export default function UserSellingItemsComponent() {
	const [statusFilter, setStatusFilter] = useState<OrderStatus>('all');
	const [selectedOrder, setSelectedOrder] = useState<OrderType | null>(null);

	const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
	const [isShippingDialogOpen, setIsShippingDialogOpen] = useState(false);

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
			return userOrderList;
		},
	});

	type OrderType = (typeof orders)[number];

	const handlePayment = (order: OrderType) => {
		setSelectedOrder(order);
		setIsPaymentDialogOpen(true);
	};

	const handleShipping = (order: OrderType) => {
		setSelectedOrder(order);
		setIsShippingDialogOpen(true);
	};

	// Update the completePayment function to use order_status
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

	return (
		<div className='flex w-full flex-col gap-7 overflow-auto px-4'>
			<div className='flex flex-col gap-4 space-y-6'>
				<Card>
					<CardHeader className='pb-3'>
						<CardTitle> You have {orders.length} total orders</CardTitle>
						<CardDescription>
							<div className='flex flex-col justify-between gap-4 sm:flex-row'>
								<div></div>
								<div className='flex items-center gap-2'>
									<Label className='font-medium'>Order status:</Label>
									<Select
										value={statusFilter}
										onValueChange={(value) => {
											setStatusFilter(value as OrderStatus);
										}}
										defaultValue='all'>
										<SelectTrigger className='w-full sm:w-[180px]'>
											<SelectValue placeholder='Filter by status' />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value='all'>All</SelectItem>
											<SelectItem value='payment_pending'>Pending Payment</SelectItem>
											<SelectItem value='payment_confirmed'>Payment Confirmed</SelectItem>
											<SelectItem value='payment_failed'>Payment Failed</SelectItem>
											<SelectItem value='payment_refunded'>Payment Refunded</SelectItem>
											<SelectItem value='shipping_pending'>Shipping Pending</SelectItem>
											<SelectItem value='shipping_confirmed'>Shipping Confirmed</SelectItem>
											<SelectItem value='completed'>Completed</SelectItem>
											<SelectItem value='cancelled'>Cancelled</SelectItem>
											<SelectItem value='expired'>Expired</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</div>
						</CardDescription>
					</CardHeader>
					<CardContent>
						{isOrdersLoading ? (
							<div className='flex h-full items-center justify-center'>
								<Spinner />
							</div>
						) : (
							<div className='flex flex-col gap-4'>
								<div className='overflow-hidden rounded-md border'>
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>ID</TableHead>
												<TableHead>Item</TableHead>
												<TableHead>Date</TableHead>
												<TableHead>Seller</TableHead>
												<TableHead className='hidden md:table-cell'>Original Price</TableHead>
												<TableHead>Proposal Price</TableHead>
												<TableHead>Status</TableHead>
												<TableHead className='text-right'></TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{orders.length > 0 ? (
												orders.map((order) => (
													<TableRow key={order.id}>
														<TableCell className='font-medium'>{order.id}</TableCell>
														<TableCell className='max-w-[280px] truncate font-bold'>
															<Link
																href={`/item/${linkBuilder({
																	id: order.item.id,
																	title: order.item.title,
																})}`}
																className='hover:text-accent text-primary hover:underline'>
																{order.item.title}
															</Link>
														</TableCell>
														<TableCell>{format(new Date(order.created_at), 'MM/dd/yyyy - HH:mm')}</TableCell>

														<TableCell className='max-w-[280px] truncate font-bold'>
															<Link href={`/user/${order.seller.username}`} className='text-accent hover:underline'>
																{order.seller.username}
															</Link>
														</TableCell>
														<TableCell className='hidden md:table-cell'>
															€ {formatPrice(order.original_price)}
														</TableCell>
														<TableCell>€ {formatPrice(order.finished_price)}</TableCell>
														<TableCell>{getStatusBadge(order.order_status)}</TableCell>
														<TableCell className='text-right'>
															<div className='flex justify-end gap-2'>
																{order.order_status === 'payment_pending' && (
																	<Button size='sm' className='font-bold' onClick={() => handlePayment(order)}>
																		<CreditCard className='h-4 w-4' />
																		Pay
																	</Button>
																)}
																{order.order_status === 'shipping_confirmed' && (
																	<Button
																		variant='secondary'
																		size='sm'
																		className='font-bold'
																		onClick={() => handleShipping(order)}>
																		<CreditCard className='h-4 w-4' />
																		Follow shipping
																	</Button>
																)}
															</div>
														</TableCell>
													</TableRow>
												))
											) : (
												<TableRow>
													<TableCell colSpan={8} className='h-24 text-center'>
														No orders found.
													</TableCell>
												</TableRow>
											)}
										</TableBody>
									</Table>
								</div>
							</div>
						)}
					</CardContent>
				</Card>

				<PaymentDialog
					isOpen={isPaymentDialogOpen}
					setIsOpen={setIsPaymentDialogOpen}
					order={selectedOrder}
					onPaymentComplete={completePayment}
				/>

				<ShippingDialog
					isOpen={isShippingDialogOpen}
					setIsOpen={setIsShippingDialogOpen}
					order={selectedOrder}
					onShippingComplete={completeShipping}
				/>
			</div>
		</div>
	);
}
