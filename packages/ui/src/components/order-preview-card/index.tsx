'use client';

import React from 'react';
import { Package, User, Calendar } from 'lucide-react';

import { Card, CardContent, CardHeader } from '@workspace/ui/components/card';
import { Separator } from '@workspace/ui/components/separator';

import { OrderStatusBadge } from './order-status-badge';
import { OrderActions } from './order-actions';

import { OrderType } from '@workspace/shared/server_bridge';
import { enumeratedValues } from '@workspace/shared/server_bridge';

const { ORDER_PHASES } = enumeratedValues;

interface OrderPreviewCardProps {
	order: OrderType & { status: (typeof ORDER_PHASES)[keyof typeof ORDER_PHASES] };
	onCompletePayment?: () => void;
	onCancel?: () => void;
	onRequestAssistance?: () => void;
	onViewShipment?: () => void;
}

export default function OrderPreviewCard({
	order,
	onCompletePayment,
	onCancel,
	onRequestAssistance,
	onViewShipment,
}: OrderPreviewCardProps) {
	const formatPrice = (price: number) => {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
		}).format(price / 100); // Assuming prices are in cents
	};

	const formatDate = (dateString: string) => {
		return new Intl.DateTimeFormat('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		}).format(new Date(dateString));
	};

	const totalAmount =
		order.original_price + order.shipping_price + order.payment_provider_charge + order.platform_charge;

	return (
		<Card className='w-full'>
			<CardHeader className='pb-4'>
				<div className='flex items-center justify-between'>
					<div className='flex items-center gap-2'>
						<Package className='text-muted-foreground h-5 w-5' />
						<span className='text-muted-foreground text-sm font-medium'>Order #{order.id}</span>
					</div>
					<OrderStatusBadge status={order.status} />
				</div>
			</CardHeader>

			<CardContent className='space-y-4'>
				{/* Item Information */}
				<div className='space-y-2'>
					<h3 className='text-lg font-semibold leading-tight'>{order.item.title}</h3>
					<div className='text-muted-foreground flex items-center gap-2 text-sm'>
						<User className='h-4 w-4' />
						<span>Sold by @{order.seller.username}</span>
					</div>
				</div>

				<Separator />

				{/* Pricing Breakdown */}
				<div className='space-y-2'>
					<div className='flex justify-between text-sm'>
						<span>Item Price</span>
						<span>{formatPrice(order.original_price)}</span>
					</div>
					<div className='flex justify-between text-sm'>
						<span>Shipping</span>
						<span>{formatPrice(order.shipping_price)}</span>
					</div>
					<div className='flex justify-between text-sm'>
						<span>Service Fee</span>
						<span>{formatPrice(order.payment_provider_charge + order.platform_charge)}</span>
					</div>
					<Separator />
					<div className='flex justify-between font-semibold'>
						<span>Total</span>
						<span>{formatPrice(totalAmount)}</span>
					</div>
				</div>

				<Separator />

				{/* Order Date */}
				<div className='text-muted-foreground flex items-center gap-2 text-sm'>
					<Calendar className='h-4 w-4' />
					<span>Ordered on {formatDate(order.created_at)}</span>
				</div>

				{/* Actions */}
				<div className='pt-2'>
					<OrderActions
						status={order.status}
						onCompletePayment={onCompletePayment}
						onCancel={onCancel}
						onRequestAssistance={onRequestAssistance}
						onViewShipment={onViewShipment}
					/>
				</div>
			</CardContent>
		</Card>
	);
}
