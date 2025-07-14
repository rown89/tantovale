'use client';

import { z } from 'zod/v4';
import { useField, useForm } from '@tanstack/react-form';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@workspace/ui/components/button';
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@workspace/ui/components/dialog';
import { Input } from '@workspace/ui/components/input';
import { Label } from '@workspace/ui/components/label';
import { Textarea } from '@workspace/ui/components/textarea';
import { formatPrice, formatPriceToCents } from '@workspace/server/price-formatter';
import { create_order_proposal_schema } from '@workspace/server/extended_schemas';
import { Spinner } from '@workspace/ui/components/spinner';

import { FieldInfo } from '#components/forms/utils/field-info';
import useTantovaleStore from '#stores';
import { getPlatformsCosts } from '#queries/get-platforms-costs';
import { useAuth } from '#providers/auth-providers';
import { getShippingCost } from '#queries/get-shipping-cost';
import { useEffect } from 'react';

export function ProposalDialog() {
	const { user } = useAuth();

	const { setChatId, item, isProposalModalOpen, isCreatingProposal, setIsProposalModalOpen, handleProposal } =
		useTantovaleStore();

	const formSchema = create_order_proposal_schema.extend({
		proposal_price: z
			.number()
			.min(0.01)
			.max(item?.price ? formatPrice(item?.price - 1) : 0),
	});

	const form = useForm({
		defaultValues: {
			item_id: item?.id ?? 0,
			proposal_price: !item?.price ? 0 : formatPrice(item.price - 1),
			message: 'Hello, I would like to buy your item, can you make it cheaper?',
			shipping_label_id: '',
		},
		validators: {
			onSubmit: formSchema,
		},
		onSubmit: async ({ value }) => {
			if (!item) return;

			const item_id = value.item_id;
			const proposal_price = formatPriceToCents(value.proposal_price);
			const message = value.message;

			try {
				const result = await handleProposal({
					item_id,
					proposal_price,
					shipping_label_id: value.shipping_label_id,
					message,
				});

				if (result) {
					setIsProposalModalOpen(false);
					setChatId(result.chat_room_id);

					toast.success('Proposal sent successfully', {
						description: 'The seller will be notified to Accept or Reject the proposal.',
						duration: 8000,
					});
				}
			} catch (error) {
				toast.error('Failed to submit proposal :(', {
					description: 'Please try again later.',
					duration: 8000,
				});
			}
		},
	});

	const priceField = useField({ form, name: 'proposal_price' });
	const formPrice = priceField.state.value;

	const userIsNotSeller = !!user && user?.profile_id !== item?.user.id;
	const hasMandatoryArguments = userIsNotSeller && !!item && !!item?.id && !!item?.price;

	const {
		data: shippingCost,
		isLoading: isLoadingShippingCost,
		error: errorShippingCost,
	} = useQuery({
		queryKey: ['shipping_cost', item?.id],
		queryFn: async () => {
			if (!item) return null;

			const shippingCost = await getShippingCost(item.id);

			if (shippingCost?.shipment_label_id) {
				form.setFieldValue('shipping_label_id', shippingCost.shipment_label_id);
			}

			return shippingCost ?? null;
		},
		enabled: isProposalModalOpen && hasMandatoryArguments,
		staleTime: 1000 * 60 * 60 * 24, // 24 hours
	});

	const {
		data: platformsCosts,
		isLoading: isLoadingPlatformsCosts,
		error: errorPlatformsCosts,
	} = useQuery({
		queryKey: ['platforms_costs', formPrice, shippingCost, item?.id],
		queryFn: async () => {
			const shippingCostValue = shippingCost?.amount ? formatPriceToCents(shippingCost.amount) : 0;
			const totalPrice = formatPriceToCents(formPrice);

			const platformsCosts = await getPlatformsCosts(totalPrice, shippingCostValue);

			return platformsCosts;
		},
		enabled: isProposalModalOpen && hasMandatoryArguments && !!shippingCost,
		staleTime: 1000 * 60 * 60 * 24, // 24 hours
	});

	if (!item) return null;

	const getTotalAmount = () => {
		if (!platformsCosts || !shippingCost) return 0;

		const itemPriceInCents = Number(formatPriceToCents(formPrice) || item.price);
		const shippingCostInCents = formatPriceToCents(Number(shippingCost.amount));
		const easyPayCharge = Number(platformsCosts.payment_provider_charge) + Number(platformsCosts.platform_charge);

		const totalInCents = itemPriceInCents + easyPayCharge + shippingCostInCents;

		return formatPrice(totalInCents);
	};

	return (
		<Dialog
			open={isProposalModalOpen}
			onOpenChange={(value) => {
				setIsProposalModalOpen(value);
				if (!value) form.reset();
			}}>
			<DialogContent className='sm:max-w-[425px]'>
				<DialogClose disabled={isCreatingProposal} />
				<DialogHeader>
					<DialogTitle>Make a Price Proposal</DialogTitle>
					<DialogDescription>
						Propose a price to start a negotiation.
						<br />
						Avoid crazy low prices, the seller will reject it.
					</DialogDescription>
				</DialogHeader>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();

						form.handleSubmit();
					}}>
					<div className='mb-6 mt-2 grid grid-cols-1 items-center gap-8'>
						<div className='flex flex-col gap-2'>
							<div className='flex w-full items-center justify-between gap-2'>
								<form.Field name='proposal_price'>
									{(field) => {
										const { name, handleBlur, handleChange, state } = field;
										const { value } = state;

										return (
											<div className='item-center flex w-full gap-2'>
												<Label className='min-w-[180px]' htmlFor='price'>
													Propose a price:
												</Label>

												<div className='flex w-full flex-col gap-2'>
													<Input
														id={name}
														name={name}
														className='w-full min-w-[130px] text-center'
														type='number'
														step='0.01'
														min='0.01'
														max={item.price - 1}
														placeholder={`Max: ${formatPrice(item.price - 0.01)}`}
														value={value}
														onChange={(e) => {
															const value = e.target.value;

															handleChange(value === '' ? 0 : Number(value));
														}}
														onBlur={handleBlur}
													/>
													<FieldInfo field={field} />
												</div>
											</div>
										);
									}}
								</form.Field>
							</div>
						</div>

						{/* Shipping cost */}
						<div className='mb-2 flex flex-col gap-1'>
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
								{errorPlatformsCosts && !isLoadingPlatformsCosts && <p className='text-sm text-red-500'>-- €</p>}

								{isLoadingPlatformsCosts ? (
									<Spinner size='small' />
								) : (
									platformsCosts?.platform_charge &&
									platformsCosts?.payment_provider_charge && (
										<div className='flex flex-col gap-1'>
											<p className='text-sm'>
												{formatPrice(platformsCosts.platform_charge) +
													formatPrice(platformsCosts.payment_provider_charge)}
												€
											</p>
										</div>
									)
								)}
							</div>
							<Label className='text-muted-foreground/70 text-sm'>
								Platform fee for organizing the shipment and improving the security of the payment.
							</Label>
						</div>

						{/* Total price */}
						<div className='mb-2 flex flex-col items-end gap-1'>
							<Label className='font-extrabold uppercase'>YOU PAY:</Label>
							<span className='w-fit text-sm'>
								{(errorPlatformsCosts || errorShippingCost) && !isLoadingPlatformsCosts && (
									<p className='text-sm text-red-500'>-- €</p>
								)}

								{(isLoadingPlatformsCosts || isLoadingShippingCost) &&
								!errorPlatformsCosts &&
								!errorShippingCost &&
								!platformsCosts?.platform_charge ? (
									<Spinner size='small' />
								) : (
									<p>{getTotalAmount()} €</p>
								)}
							</span>
						</div>

						<form.Field name='message'>
							{(field) => {
								const { name, handleBlur, handleChange, state } = field;
								const { value } = state;

								return (
									<div className='flex flex-col gap-4'>
										<Label htmlFor='message'>Message</Label>

										<Textarea
											name={name}
											rows={4}
											placeholder={`Write a message to the user`}
											value={value !== undefined ? value?.toString() : ''}
											onChange={(e) => handleChange(e.target.value)}
											onBlur={handleBlur}
										/>
										<FieldInfo field={field} />
									</div>
								);
							}}
						</form.Field>
					</div>

					<div className='my-7' />

					<DialogFooter className='flex flex-col gap-3'>
						<Label className='text-sm text-orange-400'>
							Unanswered proposals will automatically expire in{' '}
							{platformsCosts ? platformsCosts?.proposalExpireTime / 24 : '--'} days.
						</Label>

						<form.Subscribe
							selector={(formState) => ({
								canSubmit: formState.canSubmit,
								isSubmitting: formState.isSubmitting,
								isDirty: formState.isDirty,
							})}>
							{(state) => {
								const { canSubmit, isSubmitting, isDirty } = state;
								return (
									<Button
										type='submit'
										disabled={
											isSubmitting ||
											!canSubmit ||
											isLoadingPlatformsCosts ||
											isLoadingShippingCost ||
											!shippingCost ||
											!platformsCosts?.platform_charge ||
											!!errorPlatformsCosts
										}>
										{form.state.isSubmitting ? 'Submitting...' : 'Send'}
									</Button>
								);
							}}
						</form.Subscribe>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
