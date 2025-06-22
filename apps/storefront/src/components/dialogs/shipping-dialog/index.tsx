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
	order: any;
	onShippingComplete: () => void;
}) {
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
					<Button type='submit'>Save changes</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
