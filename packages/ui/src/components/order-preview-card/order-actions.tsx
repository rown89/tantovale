'use client';

import React from 'react';
import { Button } from '@workspace/ui/components/button';
import { CreditCard, X, HelpCircle, Truck } from 'lucide-react';
import { enumeratedValues } from '@workspace/shared/server_bridge';

const { ORDER_PHASES } = enumeratedValues;

type status = (typeof ORDER_PHASES)[keyof typeof ORDER_PHASES];

interface OrderActionsProps {
	status: status;
	onCompletePayment?: () => void;
	onCancel?: () => void;
	onRequestAssistance?: () => void;
	onViewShipment?: () => void;
}

export function OrderActions({
	status,
	onCompletePayment,
	onCancel,
	onRequestAssistance,
	onViewShipment,
}: OrderActionsProps) {
	const getActions = (status: status) => {
		switch (status) {
			case ORDER_PHASES.PAYMENT_PENDING:
				return [
					{
						label: 'Complete Payment',
						icon: CreditCard,
						onClick: onCompletePayment,
						variant: 'default' as const,
					},
					{
						label: 'Cancel',
						icon: X,
						onClick: onCancel,
						variant: 'outline' as const,
					},
				];

			case ORDER_PHASES.PAYMENT_FAILED:
				return [
					{
						label: 'Complete Payment',
						icon: CreditCard,
						onClick: onCompletePayment,
						variant: 'default' as const,
					},
					{
						label: 'Request Assistance',
						icon: HelpCircle,
						onClick: onRequestAssistance,
						variant: 'outline' as const,
					},
				];

			case ORDER_PHASES.PAYMENT_CONFIRMED:
			case ORDER_PHASES.SHIPPING_PENDING:
				return [
					{
						label: 'Request Assistance',
						icon: HelpCircle,
						onClick: onRequestAssistance,
						variant: 'outline' as const,
					},
				];

			case ORDER_PHASES.SHIPPING_CONFIRMED:
				return [
					{
						label: 'Shipment Info',
						icon: Truck,
						onClick: onViewShipment,
						variant: 'default' as const,
					},
					{
						label: 'Request Assistance',
						icon: HelpCircle,
						onClick: onRequestAssistance,
						variant: 'outline' as const,
					},
				];

			case ORDER_PHASES.COMPLETED:
				return [
					{
						label: 'Request Assistance',
						icon: HelpCircle,
						onClick: onRequestAssistance,
						variant: 'outline' as const,
					},
				];

			case ORDER_PHASES.CANCELLED:
			case ORDER_PHASES.EXPIRED:
			case ORDER_PHASES.PAYMENT_REFUNDED:
				return [
					{
						label: 'Request Assistance',
						icon: HelpCircle,
						onClick: onRequestAssistance,
						variant: 'outline' as const,
					},
				];

			default:
				return [];
		}
	};

	const actions = getActions(status);

	if (actions.length === 0) return null;

	return (
		<div className='flex flex-wrap gap-2 sm:flex-nowrap'>
			{actions.map((action, index) => {
				const Icon = action.icon;
				return (
					<Button
						key={index}
						variant={action.variant}
						size='sm'
						onClick={action.onClick}
						className='flex flex-1 items-center justify-center gap-2 sm:flex-none'>
						<Icon className='h-4 w-4' />
						{action.label}
					</Button>
				);
			})}
		</div>
	);
}
