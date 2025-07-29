'use client';

import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@workspace/ui/components/dialog';

export function ShippingDialog({
	isOpen,
	setIsOpen,
	order,
}: {
	isOpen: boolean;
	setIsOpen: (open: boolean) => void;
	order: any;
}) {
	if (!order) return null;

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogContent>
				<DialogClose />
				<DialogHeader>
					<DialogTitle>View Shipment</DialogTitle>
				</DialogHeader>
				<DialogDescription>View the shipment for this order.</DialogDescription>
			</DialogContent>
		</Dialog>
	);
}
