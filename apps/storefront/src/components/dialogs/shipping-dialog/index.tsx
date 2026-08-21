'use client';

import { Button } from '@workspace/ui/components/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@workspace/ui/components/dialog';

export function ShippingDialog({
	isOpen,
	setIsOpen,
	order,
	onShippingComplete,
}: {
	isOpen: boolean;
	setIsOpen: (open: boolean) => void;
	order: { item: { id: number; title: string } } | null;
	onShippingComplete: () => void;
}) {
	if (!order) return null;

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogContent className='sm:max-w-[425px]'>
				<DialogHeader>
					<DialogTitle>Complete Shipping</DialogTitle>
					<DialogDescription>Complete shipping for the order.</DialogDescription>
				</DialogHeader>
				<div className='grid gap-4 py-4'>
					<p>
						{order.item.title} - {order.item.id}
					</p>
				</div>
				<DialogFooter>
					<Button type='button' onClick={onShippingComplete}>
						Save changes
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
