'use client';

import { useAuth } from '#providers/auth-providers';
import { getPlatformsCosts } from '#queries/get-platforms-costs';
import { getShippingCost } from '#queries/get-shipping-cost';
import useTantovaleStore from '#stores';
import { useQuery } from '@tanstack/react-query';
import { formatPrice, formatPriceToCents } from '@workspace/server/price-formatter';
import { useAddressesRetrieval } from '@workspace/shared/hooks/use-user-address-retrieval';

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
import { isCommerceActionReady, platformCostsQueryKey, shippingQuoteQueryKey } from '#utils/commerce-query-state';

export function BuyNowDialog() {
	const { user } = useAuth();
	const { handleBuyNow, item, isBuyNowModalOpen, isCreatingOrder, setIsBuyNowModalOpen } = useTantovaleStore();
	const { userAddress, isUserAddressLoading, isUserAddressError } = useAddressesRetrieval({
		profileId: user?.profile_id,
		status: 'active',
		enabled: isBuyNowModalOpen && !!user,
	});

	const userIsNotSeller = !!user && !!item && user.profile_id !== item.user.id;
	const hasMandatoryArguments = userIsNotSeller && !!item?.id && !!item?.price;
	const itemId = item?.id;
	const itemPrice = item?.price;
	const activeAddressId = userAddress?.[0]?.id;
	const canQuoteShipping = hasMandatoryArguments && !!activeAddressId && !isUserAddressLoading && !isUserAddressError;

	const {
		data: shippingCost,
		isLoading: isLoadingShippingCost,
		error: errorShippingCost,
	} = useQuery({
		queryKey: shippingQuoteQueryKey({
			flow: 'buy_now',
			profileId: user?.profile_id,
			addressId: activeAddressId,
			itemId,
		}),
		queryFn: async () => {
			if (!itemId) return null;

			const shippingCost = await getShippingCost(itemId);

			return shippingCost;
		},
		enabled: isBuyNowModalOpen && canQuoteShipping,
		staleTime: 10 * 60 * 1_000,
		refetchOnMount: true,
	});

	const {
		data: platformsCosts,
		isLoading: isLoadingPlatformsCosts,
		error: errorPlatformsCosts,
	} = useQuery({
		queryKey: platformCostsQueryKey({
			flow: 'buy_now',
			profileId: user?.profile_id,
			addressId: activeAddressId,
			itemId,
			price: itemPrice,
			shippingQuoteId: shippingCost?.shipping_quote_id,
			shippingAmount: shippingCost?.amount,
		}),
		queryFn: async () => {
			if (!itemPrice) return null;

			const shippingCostValue = shippingCost?.amount ? formatPriceToCents(shippingCost.amount) : 0;

			const platformsCosts = await getPlatformsCosts(itemPrice, shippingCostValue);

			return platformsCosts;
		},
		enabled: isBuyNowModalOpen && canQuoteShipping && !!shippingCost,
		staleTime: 10 * 60 * 1_000,
	});
	const canCreateOrder = isCommerceActionReady({
		hasMandatoryArguments,
		canQuoteShipping,
		activeAddressId,
		hasShippingQuote: !!shippingCost,
		hasPlatformCosts: !!platformsCosts,
		isShippingLoading: isLoadingShippingCost,
		isPlatformLoading: isLoadingPlatformsCosts,
		hasShippingError: !!errorShippingCost,
		hasPlatformError: !!errorPlatformsCosts,
		isMutating: isCreatingOrder,
	});

	if (!item) return null;

	return (
		<Dialog open={isBuyNowModalOpen} onOpenChange={setIsBuyNowModalOpen}>
			<DialogContent className='sm:max-w-[425px]'>
				<DialogClose disabled={isCreatingOrder} />
				<DialogHeader>
					<DialogTitle>Buy Now</DialogTitle>
					<DialogDescription>
						Please review the details before proceeding with the purchase. If you click on &quot;Pay&quot; an order will
						be created and you will be redirected to the payment page.
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
									Shipping is calculated based on your and item location. It&apos;s fixed and excluded from this
									proposal price.
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
						disabled={!canCreateOrder}
						onClick={async () => {
							try {
								const response = await handleBuyNow(item.id);
								const { payment_url } = response;

								if (payment_url) {
									toast.success('Order created successfully!', {
										description: 'Please wait while we redirect you to the payment page.',
										duration: 8000,
									});

									setTimeout(() => {
										window.open(payment_url, '_blank');
									}, 3000);
								} else {
									toast.error('Oops!', {
										description: 'Error creating order, please try again later.',
										duration: 8000,
									});
								}
							} catch {
								toast.error('Oops!', {
									description: 'Error creating order, please try again later.',
									duration: 8000,
								});
							} finally {
								setIsBuyNowModalOpen(false);
							}
						}}>
						{!isCreatingOrder ? 'Add to Orders' : <Spinner size='small' className='text-white' />}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
