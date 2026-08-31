'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Badge } from '@workspace/ui/components/badge';
import { ItemDetailCard } from '@workspace/ui/components/item-detail-card/index';
import { useIsMobile } from '@workspace/ui/hooks/use-mobile';

import { UserInfoBox } from './components/user-info-box';
import { ProposalButton } from './components/proposal-button';
import { PaymentButton } from './components/payment-button';
import { ItemWrapperProps } from '../types';
import { BuyNowDialog } from '#components/dialogs/buy-now-dialog';
import { ProposalDialog } from '#components/dialogs/order-proposal-dialog';
import { useAuth } from '#providers/auth-providers';
import useTantovaleStore from '#stores';
import AddressProtectedRoute from '#utils/address-protected';
import { createAddressPreflightController } from '#utils/address-preflight-lifecycle';
import { captureCommerceOwner, commerceOwnerMatches } from '#stores/commerce-ownership';

export default function ItemWDetailWrapper({
	item,
	itemOwnerData,
	chatId,
	isFavorite,
	isCurrentUserTheItemOwner,
}: ItemWrapperProps) {
	const { user } = useAuth();
	const isMobile = useIsMobile();
	const router = useRouter();
	const {
		clientBuyNowOrderId,
		clientBuyNowOrderStatus,
		clientProposalId,
		clientProposalCreatedAt,
		setItem,
		setItemOwnerData,
		setOrderProposal,
		setIsAddressLoading,
		isAddressLoading,
		setAddressId,
		commerceOwnerProfileId,
		commerceOwnerItemId,
		setCommerceContext,
		resetPrivateCommerceState,
	} = useTantovaleStore();

	const orderProposal = item.orderProposal;
	const profileId = user?.profile_id ?? null;
	const ownsCurrentCommerceState = commerceOwnerProfileId === profileId && commerceOwnerItemId === item.id;

	const proposalId = orderProposal?.id || (ownsCurrentCommerceState ? clientProposalId : undefined) || 0;
	const proposalCreatedAt =
		orderProposal?.created_at || (ownsCurrentCommerceState ? clientProposalCreatedAt : undefined) || '';

	const orderId = item.order.id || (ownsCurrentCommerceState ? clientBuyNowOrderId : 0) || 0;
	const orderStatus = item.order.status || (ownsCurrentCommerceState ? clientBuyNowOrderStatus : '');

	// Use null as initial state to match SSR
	const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
	// Track if UserInfoBox is in view
	const [isInfoBoxInView, setIsInfoBoxInView] = useState(false);

	const fileInputRef = useRef<HTMLInputElement>(null);
	const infoBoxRef = useRef<HTMLDivElement>(null);
	const addressPreflight = useMemo(() => createAddressPreflightController(), []);

	const { setIsProposalModalOpen, setIsBuyNowModalOpen } = useTantovaleStore();

	// Effect to check if the UserInfoBox is in view
	useEffect(() => {
		const infoBox = infoBoxRef.current;
		if (!infoBox) return;

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]) {
					setIsInfoBoxInView(entries[0].isIntersecting);
				}
			},
			{ threshold: 0.01 }, // Consider visible when 10% is in view
		);

		observer.observe(infoBox);

		return () => {
			observer.unobserve(infoBox);
		};
	}, []);

	useEffect(() => {
		setCommerceContext(profileId, item.id);
		setItem(item);
		setItemOwnerData(itemOwnerData);
		setOrderProposal(orderProposal);

		return () => {
			resetPrivateCommerceState();
		};
	}, [
		item,
		itemOwnerData,
		orderProposal,
		profileId,
		resetPrivateCommerceState,
		setCommerceContext,
		setItem,
		setItemOwnerData,
		setOrderProposal,
	]);

	useEffect(() => () => addressPreflight.invalidate(), [addressPreflight]);

	// Create a list of memoized image nodes
	const imagesNodeList = useMemo(() => {
		return item.images?.map((url, i) => {
			if (!url) return null;

			return (
				<Image
					key={i}
					onClick={() => {
						setFullscreenImage(url);
					}}
					className='object-cover hover:cursor-pointer'
					fill
					sizes='(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw'
					priority
					src={url}
					alt=''
				/>
			);
		});
	}, [item.images]);

	const handleProposal = useCallback(async () => {
		if (!user) {
			router.push('/login');
		} else {
			const owner = captureCommerceOwner(useTantovaleStore.getState());
			if (owner.commerceOwnerProfileId !== user.profile_id || owner.commerceOwnerItemId !== item.id) return;
			await addressPreflight.run({
				request: AddressProtectedRoute,
				isOwnerCurrent: () => commerceOwnerMatches(useTantovaleStore.getState(), owner),
				setLoading: setIsAddressLoading,
				onAddress: (addressId) => {
					setAddressId(addressId);
					setIsProposalModalOpen(true);
				},
				onMissing: () => {
					toast.error('Oops!', {
						description: 'You must have an active address to sell or buy.',
						duration: 8000,
					});
					router.push('/auth/profile-setup/address');
				},
				onError: () => {
					toast.error('Oops!', { description: 'Unable to verify your active address.', duration: 8000 });
				},
			});
		}
	}, [addressPreflight, item.id, user, router, setIsAddressLoading, setAddressId, setIsProposalModalOpen]);

	const handlePayment = useCallback(async () => {
		if (!user) {
			router.push('/login');
		} else {
			const owner = captureCommerceOwner(useTantovaleStore.getState());
			if (owner.commerceOwnerProfileId !== user.profile_id || owner.commerceOwnerItemId !== item.id) return;
			await addressPreflight.run({
				request: AddressProtectedRoute,
				isOwnerCurrent: () => commerceOwnerMatches(useTantovaleStore.getState(), owner),
				setLoading: setIsAddressLoading,
				onAddress: (addressId) => {
					setAddressId(addressId);
					setIsBuyNowModalOpen(true);
				},
				onMissing: () => {
					toast.error('Oops!', {
						description: 'You must have an active address to sell or buy.',
						duration: 8000,
					});
					router.push('/auth/profile-setup/address');
				},
				onError: () => {
					toast.error('Oops!', { description: 'Unable to verify your active address.', duration: 8000 });
				},
			});
		}
	}, [addressPreflight, item.id, user, router, setIsAddressLoading, setAddressId, setIsBuyNowModalOpen]);

	return (
		<div className='container mx-auto my-4 flex flex-col px-4 xl:px-0'>
			<div className='flex h-full w-full flex-col gap-8 xl:flex-row xl:gap-12'>
				{/* Item Card Detail  */}
				<ItemDetailCard
					imagesRef={fileInputRef}
					item={{
						...item,
						images: imagesNodeList,
						subcategory: item.subcategory && (
							<Link href={`/items/condition/${item.subcategory.slug ?? '#'}`} target='_blank' className='mb-2'>
								<Badge variant='outline' className='bg-accent px-3 text-sm'>
									{item.subcategory.name}
								</Badge>
							</Link>
						),
					}}
				/>

				{/* Right sidebar */}
				{
					<UserInfoBox
						ref={infoBoxRef}
						item={{
							...item,
							order: {
								...item.order,
								id: orderId,
								status: orderStatus,
							},
							orderProposal: {
								...item.orderProposal,
								id: proposalId,
								created_at: proposalCreatedAt,
							},
						}}
						chatId={chatId}
						itemOwnerData={itemOwnerData}
						isFavorite={isFavorite}
						isCurrentUserTheItemOwner={isCurrentUserTheItemOwner}
						handleProposal={handleProposal}
						handlePayment={handlePayment}
					/>
				}

				{isMobile && !isInfoBoxInView && item?.easy_pay && (
					<div className='fixed bottom-0 left-0 flex w-full items-center justify-center gap-2 px-8 pb-4'>
						{item.order.id && <p>Venduto</p>}
						{!item.order.id && !proposalId && (
							<ProposalButton isLoading={isAddressLoading} handleProposal={handleProposal} />
						)}
						{item.easy_pay && !item.order.id && (
							<PaymentButton isLoading={isAddressLoading} handlePayment={handlePayment} />
						)}
						<div className='bg-accent fixed bottom-0 left-0 right-0 h-[40px] w-full opacity-50 blur-xl' />
					</div>
				)}
			</div>

			{item?.easy_pay && ownsCurrentCommerceState && (
				<>
					<BuyNowDialog />
					<ProposalDialog />
				</>
			)}

			{/* image Fullscreen Preview (doesn't work on initial placeholder images) */}
			{
				<AnimatePresence>
					{fullscreenImage && (
						<motion.div
							className='fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80'
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							onClick={() => setFullscreenImage(null)}>
							<motion.img
								src={fullscreenImage}
								alt='Fullscreen'
								className='h-full object-contain p-12'
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								transition={{ duration: 0.2, ease: 'easeInOut' }}
							/>
						</motion.div>
					)}
				</AnimatePresence>
			}
		</div>
	);
}
