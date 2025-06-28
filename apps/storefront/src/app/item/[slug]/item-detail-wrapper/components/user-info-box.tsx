'use client';

import { Heart, Frown, FileSpreadsheet } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { forwardRef } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { toast } from 'sonner';
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
import AddressProtectedRoute from '#utils/address-protected';
import { PaymentButton } from './payment-button';

interface UserInfoBoxProps extends ItemWrapperProps {
	itemOwnerData: Pick<
		ItemWrapperProps['itemOwnerData'],
		'id' | 'location' | 'phone_verified' | 'email_verified' | 'selling_items'
	>;
}

export const UserInfoBox = forwardRef<HTMLDivElement, UserInfoBoxProps>(function UserInfoBox(
	{ item, itemOwnerData, orderProposal, isFavorite, chatId, isCurrentUserTheItemOwner },
	ref,
) {
	const item_id = item.id;
	const { phone_verified, email_verified } = itemOwnerData || {};

	const { user } = useAuth();
	const router = useRouter();
	const { proposal_created_at, setIsProposalModalOpen, setIsAddressLoading, isAddressLoading, setAddressId } =
		useTantovaleStore();

	const { chatIdClient, messageBoxForm } = useItemChat({
		item_id,
		chatId,
	});

	const { isFavoriteClient, handleFavorite } = useItemFavorite({
		item_id,
		isFavorite,
	});

	const proposal_date = format(
		new Date(orderProposal?.created_at || proposal_created_at || new Date()),
		'dd/MM/yyyy - HH:mm',
	);

	return (
		<div ref={ref} className='flex h-auto w-full flex-col gap-4 xl:max-w-[450px]'>
			<Card className='w-full xl:sticky xl:top-4'>
				{!isCurrentUserTheItemOwner && (
					<CardHeader>
						<CardTitle>
							{!item.order.id ? (
								<div className={`flex flex-col items-center justify-between gap-3 break-all`}>
									{item?.easy_pay && (
										<PaymentButton
											isLoading={isAddressLoading}
											handlePayment={async () => {
												if (!user) {
													router.push('/login');
												} else {
													setIsAddressLoading(true);

													const address_id = await AddressProtectedRoute();

													if (address_id) {
														setAddressId(address_id);

														// handlePayment.mutate(item.price);
													} else {
														toast.error('You must have an active address to sell');
														router.push('/auth/profile-setup/address');
													}

													setIsAddressLoading(false);
												}
											}}
										/>
									)}

									{item?.easy_pay && !orderProposal?.id && !proposal_created_at && (
										<ProposalButton
											isLoading={isAddressLoading}
											handleProposal={async () => {
												if (!user) {
													router.push('/login');
												} else {
													setIsAddressLoading(true);

													const address_id = await AddressProtectedRoute();

													if (address_id) {
														setAddressId(address_id);
														setIsProposalModalOpen(true);
													} else {
														toast.error('You must have an active address to sell');
														router.push('/auth/profile-setup/address');
													}

													setIsAddressLoading(false);
												}
											}}
										/>
									)}

									{(orderProposal?.id || proposal_created_at) && (
										<div className='mt-2 flex w-full justify-center'>
											<Alert>
												<Repeat className='h-4 w-4' />
												<AlertTitle>Waiting for seller response</AlertTitle>
												<AlertDescription>Proposal sent on {proposal_date}</AlertDescription>
											</Alert>
										</div>
									)}

									<div className='mt-2 flex w-full justify-center'>
										<Button
											className='hover:bg-destructive/70 w-full font-bold'
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
											{!isFavoriteClient ? 'Favorite' : 'UnFavorite'}
										</Button>
									</div>
								</div>
							) : (
								<div className='item-center flex gap-2'>
									<p className='text-destructive'>Item already sold</p>
									<Frown className='text-destructive' size={16} />
								</div>
							)}
						</CardTitle>
					</CardHeader>
				)}

				<CardContent>
					<div className='flex flex-col gap-2'>
						{!item.order.id && <Separator className='mb-4' />}

						<Label className='mt-4'>Venditore:</Label>
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

				{!isCurrentUserTheItemOwner && !item.order.id && (
					<CardFooter>
						<div className='flex w-full flex-col items-start gap-2'>
							<Label className='mb-1'>Richiedi informazioni</Label>
							{!chatIdClient ? (
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
									onClick={() => router.push(`/auth/chat/${chatIdClient}`)}>
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
});
