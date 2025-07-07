'use client';

import { useAuth } from '#providers/auth-providers';
import { getPlatformsCosts } from '#queries/get-platforms-costs';
import { getShippingCost } from '#queries/get-shipping-cost';
import useTantovaleStore from '#stores';
import { useQuery } from '@tanstack/react-query';
import { formatPrice, formatPriceToCents } from '@workspace/server/price-formatter';

import { Button } from '@workspace/ui/components/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogClose,
} from '@workspace/ui/components/dialog';
import { Label } from '@workspace/ui/components/label';
import { Spinner } from '@workspace/ui/components/spinner';
import { toast } from 'sonner';

export function BuyNowDialog() {
	const { user } = useAuth();

	const { handleBuyNow, item, isBuyNowModalOpen, isCreatingOrder, setIsBuyNowModalOpen } = useTantovaleStore();

	const userIsNotSeller = !!user && !!item && user.profile_id !== item.user.id;
	const hasMandatoryArguments = userIsNotSeller && !!item?.id && !!item?.price;

	const {
		data: shippingCost,
		isLoading: isLoadingShippingCost,
		error: errorShippingCost,
	} = useQuery({
		queryKey: ['shipping_cost', item?.id],
		queryFn: async () => {
			if (!item) return null;

			const shippingCost = await getShippingCost(item.id);

			return shippingCost;
		},
		enabled: isBuyNowModalOpen && hasMandatoryArguments,
		staleTime: 1000 * 60 * 60 * 24, // 24 hours
	});

	const {
		data: platformsCosts,
		isLoading: isLoadingPlatformsCosts,
		error: errorPlatformsCosts,
	} = useQuery({
		queryKey: ['platforms_costs', shippingCost, item?.id],
		queryFn: async () => {
			if (!item) return null;

			const shippingCostValue = shippingCost?.amount ? formatPriceToCents(shippingCost.amount) : 0;

			const platformsCosts = await getPlatformsCosts(item.price, shippingCostValue);

			return platformsCosts;
		},
		enabled: isBuyNowModalOpen && hasMandatoryArguments && !!shippingCost,
		staleTime: 1000 * 60 * 60 * 24, // 24 hours
	});

	if (!item) return null;

	return (
		<Dialog open={isBuyNowModalOpen} onOpenChange={setIsBuyNowModalOpen}>
			<DialogContent className='sm:max-w-[425px]'>
				<DialogClose disabled={isCreatingOrder} />
				<DialogHeader>
					<DialogTitle>Buy Now</DialogTitle>
					<DialogDescription>
						Please review the details before proceeding with the purchase. If you click on "Pay" an order will be
						created and you will be redirected to the payment page.
					</DialogDescription>
				</DialogHeader>
				<div className='flex flex-col gap-8'>
					{/* Shipping cost */}
					<div className='my-2 flex flex-col gap-1'>
						<div className='flex justify-between gap-2'>
							<Label>Shipping cost:</Label>{' '}
							{isLoadingShippingCost ? (
								<Spinner size='small' />
							) : shippingCost?.amount ? (
								<p className='text-sm'>{shippingCost.amount}€</p>
							) : (
								<p className='text-sm text-red-500'>-- €</p>
							)}
						</div>

						{isLoadingPlatformsCosts ? (
							'---'
						) : errorShippingCost ? (
							<Label className='text-sm text-red-500'>
								There was an error retrieving the shipping cost. Please verify your address or contact the seller to
								confirm their address details.
							</Label>
						) : (
							shippingCost && (
								<Label className='text-muted-foreground/70 text-sm'>
									Shipping is calculated based on your and item location. It's fixed and excluded from this proposal
									price.
								</Label>
							)
						)}
					</div>

					{/* Platform Charge (Easy pay service) */}
					<div className='mb-2 flex flex-col gap-1'>
						<div className='flex justify-between gap-2'>
							<Label>Easy pay service:</Label>
							{isLoadingPlatformsCosts ? (
								<Spinner size='small' />
							) : platformsCosts?.platform_charge ? (
								<div className='flex flex-col gap-1'>
									<p className='text-sm'>{formatPrice(platformsCosts.platform_charge).toFixed(2)}€</p>
								</div>
							) : (
								<p className='text-sm text-red-500'>-- €</p>
							)}
						</div>
						<Label className='text-muted-foreground/70 text-sm'>
							Platform fee for organizing the shipment and improving the security of the payment.
						</Label>
					</div>

					{/* Total price */}
					<div className='mb-2 flex flex-col items-end gap-1'>
						<Label className='font-extrabold uppercase'>Total price</Label>
						<span className='w-fit text-sm'>
							{isLoadingPlatformsCosts ? (
								<Spinner size='small' />
							) : (
								<p>
									{formatPrice(
										formatPriceToCents(formatPrice(item.price)) +
											(platformsCosts?.platform_charge ?? 0) +
											formatPriceToCents(shippingCost?.amount ?? 0) +
											(platformsCosts?.payment_provider_charge ?? 0),
									)}{' '}
									€
								</p>
							)}
						</span>
					</div>
				</div>
				<DialogFooter>
					<Button
						disabled={isLoadingPlatformsCosts || isLoadingShippingCost || !!errorShippingCost || !!errorPlatformsCosts}
						onClick={async () => {
							try {
								const response = await handleBuyNow(item.id);
								const { payment_url } = response;

								if (payment_url) {
									toast.success('Order created successfully, you will be redirected to the payment page...');

									setTimeout(() => {
										window.open(payment_url, '_blank');
									}, 3000);
								} else {
									toast.error('Error creating order, please try again later');
								}
							} catch (error) {
								toast.error('Error creating order, please try again later');
							} finally {
								setIsBuyNowModalOpen(false);
							}
						}}>
						Pay
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
