'use client';

import { z } from 'zod/v4';
import { useForm } from '@tanstack/react-form';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@workspace/ui/components/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@workspace/ui/components/dialog';
import { Input } from '@workspace/ui/components/input';
import { Label } from '@workspace/ui/components/label';
import { Textarea } from '@workspace/ui/components/textarea';
import { Separator } from '@workspace/ui/components/separator';
import { formatPrice, formatPriceToCents } from '@workspace/ui/lib/utils';
import { create_order_proposal_schema } from '@workspace/server/extended_schemas';
import { Spinner } from '@workspace/ui/components/spinner';

import { FieldInfo } from '#components/forms/utils/field-info';
import useTantovaleStore from '#stores';
import { getShippingCost } from '#queries/getShippingCost';

export function ProposalDialog() {
	const { setChatId, item, isProposalModalOpen, setIsProposalModalOpen, handleProposal } = useTantovaleStore();

	const formSchema = create_order_proposal_schema.extend({
		proposal_price: z
			.number()
			.min(0.01)
			.max(formatPrice(item?.price ?? 0 - 1)),
	});

	const form = useForm({
		defaultValues: {
			item_id: item?.id ?? 0,
			proposal_price: formatPrice(item?.price ?? 0 - 1),
			message: 'Hello, I would like to buy your item, can you make it cheaper?',
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
					message,
				});

				if (result) {
					setIsProposalModalOpen(false);
					setChatId(result.chat_room_id);

					toast.success('Proposal sent successfully');
				}
			} catch (error) {
				toast.error('Failed to submit proposal. Please try again.');
			}
		},
	});

	const {
		data: shipping_cost,
		isLoading: isLoadingShippingCost,
		error: errorShippingCost,
	} = useQuery({
		queryKey: ['shipping_cost', item?.id],
		queryFn: async () => await getShippingCost(Number(item?.id)),
		enabled: !!item,
	});

	if (!item) return null;

	return (
		<Dialog
			open={isProposalModalOpen}
			onOpenChange={(value) => {
				setIsProposalModalOpen(value);
				if (!value) form.reset();
			}}>
			<DialogContent className='sm:max-w-[425px]'>
				<DialogHeader>
					<DialogTitle>Make a Price Proposal</DialogTitle>
					<Separator className='mt-4' />
				</DialogHeader>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();

						form.handleSubmit();
					}}>
					<div className='mb-6 mt-2 grid grid-cols-1 items-center gap-6'>
						<div className='flex w-full items-center justify-between gap-2'>
							<Label className='h-fit' htmlFor='price'>
								Your proposal
							</Label>
							<form.Field name='proposal_price'>
								{(field) => {
									const { name, handleBlur, handleChange, state } = field;
									const { value } = state;

									return (
										<div>
											<Input
												id={name}
												name={name}
												className='w-full min-w-[130px]'
												type='number'
												step='0.01'
												min='0.01'
												max={formatPrice(item.price)}
												placeholder={`Max: ${formatPrice(item.price)}`}
												value={value}
												onChange={(e) => {
													const value = e.target.value;

													handleChange(value === '' ? 0 : Number(value));
												}}
												onBlur={handleBlur}
											/>
											<FieldInfo field={field} />
										</div>
									);
								}}
							</form.Field>
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

					<div className='mb-2 flex flex-col gap-3'>
						<div className='flex justify-between gap-2'>
							<p className='text-sm'>Shipping cost:</p>{' '}
							{isLoadingShippingCost ? (
								<Spinner size='small' />
							) : shipping_cost?.[0]?.amount ? (
								<p className='text-sm'>{shipping_cost?.[0]?.amount}€</p>
							) : (
								<p className='text-sm text-red-500'>-- €</p>
							)}
						</div>

						{!isLoadingShippingCost && (!!errorShippingCost || !shipping_cost?.[0]?.amount) ? (
							<p className='text-sm text-red-500'>
								Error loading shipping cost, please check your address details or contact the seller asking to check his
								address.
							</p>
						) : null}

						<Label className='text-muted-foreground/70 text-sm'>
							Shipping is calculated based on your and item location. It's fixed and excluded from this proposal price.
						</Label>
					</div>

					<div className='my-7' />

					<DialogFooter className='flex items-center justify-between gap-20'>
						<Label className='text-sm text-orange-400'>Unanswered proposals will automatically expire in 7 days.</Label>

						<Button type='submit' disabled={item.price <= 0 || isLoadingShippingCost || !!errorShippingCost}>
							{form.state.isSubmitting ? 'Submitting...' : 'Send'}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
