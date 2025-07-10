'use client';

import { Heart, Frown, FileSpreadsheet } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { forwardRef } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Repeat } from 'lucide-react';

import { Button } from '@workspace/ui/components/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@workspace/ui/components/card';
import { Label } from '@workspace/ui/components/label';
import { Separator } from '@workspace/ui/components/separator';
import { Textarea } from '@workspace/ui/components/textarea';
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert';

import { ItemWrapperProps } from '../../types';
import { ProposalButton } from './proposal-button';
import { useItemFavorite } from '../hooks/use-item-favorite';
import { useItemChat } from '../hooks/use-item-chat';
import { useAuth } from '#providers/auth-providers';
import { FieldInfo } from '#components/forms/utils/field-info';
import useTantovaleStore from '#stores';
import { PaymentButton } from './payment-button';

interface UserInfoBoxProps extends ItemWrapperProps {
	itemOwnerData: Pick<
		ItemWrapperProps['itemOwnerData'],
		'id' | 'location' | 'phone_verified' | 'email_verified' | 'selling_items'
	>;
	handleProposal: () => Promise<void>;
	handlePayment: () => Promise<void>;
}

export const UserInfoBox = forwardRef<HTMLDivElement, UserInfoBoxProps>(
	(
		{ item, itemOwnerData, isFavorite, chatId: chatIdServer, isCurrentUserTheItemOwner, handleProposal, handlePayment },
		ref,
	) => {
		const { id: item_id, order, orderProposal, easy_pay } = item;
		const { phone_verified, email_verified } = itemOwnerData || {};

		const { user } = useAuth();
		const router = useRouter();
		const { chatId: chatIdClient, isAddressLoading } = useTantovaleStore();

		const { messageBoxForm } = useItemChat({
			item_id,
		});

		const { isFavoriteClient, handleFavorite } = useItemFavorite({
			item_id,
			isFavorite,
		});

		const proposal_date = format(new Date(orderProposal?.created_at || new Date()), 'dd/MM/yyyy - hh:mm a');

		const chatId = chatIdClient || chatIdServer;

		return (
			<div ref={ref} className='flex h-auto w-full flex-col gap-4 xl:max-w-[450px]'>
				<Card className='w-full xl:sticky xl:top-4'>
					{!isCurrentUserTheItemOwner && (
						<CardHeader>
							<CardTitle>
								{easy_pay && !order.id && !orderProposal?.id && (
									<div className='flex w-full flex-col items-center justify-between gap-3 break-all'>
										<PaymentButton isLoading={isAddressLoading} handlePayment={handlePayment} />

										<ProposalButton isLoading={isAddressLoading} handleProposal={handleProposal} />

										<Button
											className='hover:bg-destructive/70 mt-2 w-full font-bold'
											variant={!isFavoriteClient ? 'outline' : 'destructive'}
											onClick={() => {
												if (!user) {
													router.push('/login');
													return;
												}

												if (isFavoriteClient) {
													handleFavorite.mutate('remove');
												} else {
													handleFavorite.mutate('add');
												}
											}}
											disabled={handleFavorite.isPending}>
											{!isFavoriteClient ? <Heart className='text-inherit' /> : <Heart />}
											{!isFavoriteClient ? 'Add to Favorites' : 'Remove Favorite'}
										</Button>
									</div>
								)}

								{easy_pay && (!!order.id || !!orderProposal?.id) && (
									<div className='item-center flex gap-2 pb-2'>
										{orderProposal.id && !order.id ? (
											<Alert>
												<Repeat className='h-4 w-4' />
												<AlertTitle>Waiting for seller response</AlertTitle>
												<AlertDescription className='flex flex-col gap-2'>
													Proposal sent on {proposal_date}
												</AlertDescription>
												<Button size='sm' variant='destructive' className='mt-2 w-full'>
													Cancel Proposal
												</Button>
											</Alert>
										) : (
											<Alert>
												<Repeat className='h-4 w-4' />
												<AlertTitle>You already have an ongoing order for this item</AlertTitle>
												<AlertDescription className='flex flex-col gap-2'>
													<p className='inherit'>
														Go to{' '}
														<Link href={`/auth/profile/orders?highlight=${order.id}`} className='text-accent underline'>
															orders page
														</Link>{' '}
														to see the details.
													</p>
												</AlertDescription>
											</Alert>
										)}
									</div>
								)}
							</CardTitle>
						</CardHeader>
					)}

					<CardContent>
						<div className='flex flex-col gap-2'>
							{!order.id && <Separator className='mb-4' />}

							<Label>Venditore:</Label>
							<div className='text-accent flex w-full items-start justify-between'>
								<Link
									href={`/user/${item?.user?.username || 'user'}`}
									className='hover:text-accent item-center flex gap-2 hover:underline'>
									<p className='text-xl'>{item?.user?.username || 'User'}</p>
								</Link>
							</div>

							<div className='mb-2 grid grid-cols-2'>
								<span className='flex items-center gap-2'>
									<FileSpreadsheet size={16} /> Annunci online: {itemOwnerData?.selling_items || 0}
								</span>
							</div>
						</div>
					</CardContent>

					{!isCurrentUserTheItemOwner && !order.id && (
						<CardFooter>
							<div className='flex w-full flex-col items-start gap-2'>
								<Label className='mb-1'>Richiedi informazioni</Label>
								{!chatId ? (
									<form
										className='w-full'
										onSubmit={(e) => {
											e.preventDefault();
											e.stopPropagation();

											if (!user) {
												router.push('/login');
											} else {
												messageBoxForm.handleSubmit();
											}
										}}>
										<messageBoxForm.Field name='message'>
											{(field) => {
												const { name, handleBlur, handleChange, state } = field;
												const { value } = state;

												return (
													<div className='flex w-full flex-col gap-4'>
														<Textarea
															className='bg-background/80'
															id={name}
															name={name}
															rows={6}
															maxLength={600}
															value={value !== undefined ? value?.toString() : ''}
															onBlur={handleBlur}
															onChange={(e) => handleChange(e.target.value)}
															placeholder='Scrivi al venditore per avere informazioni....'
														/>

														<FieldInfo field={field} />
													</div>
												);
											}}
										</messageBoxForm.Field>

										<messageBoxForm.Subscribe
											selector={(formState) => ({
												canSubmit: formState.canSubmit,
												isSubmitting: formState.isSubmitting,
												isDirty: formState.isDirty,
											})}>
											{(state) => {
												const { canSubmit, isSubmitting } = state;
												return (
													<div className='mt-4 flex justify-end'>
														<Button type='submit' disabled={!canSubmit} className='sticky bottom-0'>
															{isSubmitting ? '...' : 'Invia messaggio'}
														</Button>
													</div>
												);
											}}
										</messageBoxForm.Subscribe>
									</form>
								) : (
									<Button
										variant='default'
										className='w-full font-bold'
										onClick={() => router.push(`/auth/chat/${chatId}`)}>
										Go to Chat
									</Button>
								)}
							</div>
						</CardFooter>
					)}
				</Card>

				{!isCurrentUserTheItemOwner && (
					<span className='w-full text-center'>
						Annuncio sospetto?{' '}
						<Link className='hover:text-accent underline hover:cursor-pointer' href={`/item-anomaly/${item_id}`}>
							Segnala
						</Link>
					</span>
				)}
			</div>
		);
	},
);
