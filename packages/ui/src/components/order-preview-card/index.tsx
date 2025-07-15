'use client';

import React, { ReactNode, useMemo } from 'react';
import { Package, User, Calendar, ShoppingBag } from 'lucide-react';

import { Card, CardContent, CardFooter, CardHeader } from '@workspace/ui/components/card';
import { Separator } from '@workspace/ui/components/separator';

import { OrderStatusBadge } from './order-status-badge';
import { OrderActions } from './order-actions';

import { OrderType } from '@workspace/shared/server_bridge';
import { enumeratedValues } from '@workspace/shared/server_bridge';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { Button } from '../button';
import { Popover, PopoverContent, PopoverTrigger } from '../popover';
import { Badge } from '../badge';
import { cn } from '@workspace/ui/lib/utils';

const { ORDER_PHASES } = enumeratedValues;

interface OrderPreviewCardProps {
	order: OrderType & {
		status: (typeof ORDER_PHASES)[keyof typeof ORDER_PHASES];
		seller: OrderType['seller'] & { usernameLink: ReactNode };
		item: OrderType['item'] & { itemLink: ReactNode };
	};
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
		return new Intl.NumberFormat('it-IT', {
			style: 'currency',
			currency: 'EUR',
		}).format(price / 100);
	};

	const formatDate = (dateString: string) => {
		return format(new Date(dateString), 'dd MMM yyyy', { locale: it });
	};

	const totalAmount =
		(order.proposal?.price || order.original_price) +
		order.shipping_price +
		order.payment_provider_charge +
		order.platform_charge;

	const pricingItems = [
		{
			label: 'Original Price',
			value: order.original_price,
			isConditional: false,
			isStrikethrough: !!order.proposal?.id,
		},
		...(order.proposal?.id && order.proposal.price
			? [
					{
						label: 'Proposal Price',
						value: order.proposal.price,
						isConditional: true,
						isStrikethrough: false,
					},
				]
			: []),
		{
			label: 'Shipping service',
			value: order.shipping_price,
			isConditional: false,
			isStrikethrough: false,
		},
		{
			label: 'EasyPay Fee',
			value: order.payment_provider_charge + order.platform_charge,
			isConditional: false,
			isStrikethrough: false,
		},
	];

	return (
		<Card className='hover:border-accent w-full border shadow-sm transition-colors'>
			<CardHeader className='pb-4'>
				<div className='flex items-center justify-between'>
					<div className='flex items-center gap-2'>
						<span className='text-muted-foreground text-sm font-medium'>
							<Popover>
								<PopoverTrigger>
									<Badge variant='default'>
										<Package />#{order.id}
									</Badge>
								</PopoverTrigger>
								<PopoverContent>
									<div className='flex flex-col gap-2'>
										<div className='text-muted-foreground flex items-center gap-2 text-sm'>
											<User className='h-4 w-4' />
											<p>Sold by {order.seller.usernameLink}</p>
										</div>
									</div>
								</PopoverContent>
							</Popover>
						</span>
					</div>
					<OrderStatusBadge status={order.status} />
				</div>
			</CardHeader>

			<CardContent className='space-y-2'>
				{/* Item Link */}
				<span className='flex items-center gap-2'>
					<ShoppingBag size={15} className='text-accent' /> {order.item.itemLink}
				</span>
				{/* Order Date */}
				<div className='text-muted-foreground flex w-full items-center gap-2'>
					<Calendar className='h-4 w-4' />
					<span className='text-[13px]'>Created on {formatDate(order.created_at)}</span>
				</div>
				{/* Pricing Breakdown */}
				<div className='space-y-2 pt-2'>
					{pricingItems.map((item, index) => (
						<div key={index} className='flex justify-between gap-3 text-sm'>
							<span className={cn(item.isStrikethrough && 'line-through', 'font-semibold')}>{item.label}</span>
							<span className={cn(item.isStrikethrough && 'line-through')}>{formatPrice(item.value)}</span>
						</div>
					))}

					<Separator className='my-3' />

					<div className='flex justify-between font-semibold'>
						<span className='font-bold'>Total</span>
						<span>{formatPrice(totalAmount)}</span>
					</div>
				</div>
			</CardContent>
			<CardFooter>
				{/* Actions */}
				<OrderActions
					status={order.status}
					onCompletePayment={onCompletePayment}
					onCancel={onCancel}
					onRequestAssistance={onRequestAssistance}
					onViewShipment={onViewShipment}
				/>
			</CardFooter>
		</Card>
	);
}
