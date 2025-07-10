import Link from 'next/link';
import { formatDistanceToNow, addDays } from 'date-fns';
import { RssIcon } from 'lucide-react';

import { cn } from '@workspace/ui/lib/utils';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@workspace/ui/components/card';
import { Button } from '@workspace/ui/components/button';
import { Spinner } from '@workspace/ui/components/spinner';
import { formatPrice } from '@workspace/server/price-formatter';

import { ChatMessageProps } from './types';
import { useChatMessageHook } from './use-chat-message';
import {
	Dialog,
	DialogTrigger,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
	DialogDescription,
} from '@workspace/ui/components/dialog';
import { chatMessageMetadataValues, ORDER_PROPOSAL_PHASES } from '@workspace/server/enumerated_values';

export function ChatMessage({ chatMessageProps, item, isMsgSenderCurrentUser }: ChatMessageProps) {
	const { orderProposal, isOrderProposalLoading, orderProposalError, updateProposal } =
		useChatMessageHook(chatMessageProps);

	const handleAcceptProposal = () => {
		if (!chatMessageProps.order_proposal_id) return;

		updateProposal.mutate({
			orderProposalId: chatMessageProps.order_proposal_id,
			item_id: item.id,
			status: ORDER_PROPOSAL_PHASES.accepted,
		});
	};

	const handleRejectProposal = () => {
		if (!chatMessageProps.order_proposal_id) return;

		updateProposal.mutate({
			orderProposalId: chatMessageProps.order_proposal_id,
			item_id: item.id,
			status: ORDER_PROPOSAL_PHASES.rejected,
		});
	};

	const isProposalMessage = chatMessageProps.order_proposal_id && chatMessageProps.message_type === 'proposal';
	const isSystemMessage = chatMessageProps.message_type === 'system';
	const isTextMessage = chatMessageProps.message_type === 'text';

	const proposalStatus = orderProposal?.status;

	const proposalRejected = proposalStatus === ORDER_PROPOSAL_PHASES.rejected;
	const proposalExpired = proposalStatus === ORDER_PROPOSAL_PHASES.expired;
	const proposalAccepted = proposalStatus === ORDER_PROPOSAL_PHASES.accepted;
	const proposalPending = proposalStatus === ORDER_PROPOSAL_PHASES.pending;
	const proposalBuyerAborted = proposalStatus === ORDER_PROPOSAL_PHASES.buyer_aborted;

	const proposalMetadata = chatMessageProps.metadata;

	return (
		<div
			className={cn('mb-4 flex items-start gap-2 break-all', isMsgSenderCurrentUser ? 'flex-row-reverse' : 'flex-row')}>
			<div className={cn('flex max-w-[80%] flex-col', isMsgSenderCurrentUser ? 'items-end' : 'items-start')}>
				{isProposalMessage && (
					<>
						{isOrderProposalLoading || !orderProposal ? (
							<Spinner />
						) : (
							<div className='flex flex-col gap-2'>
								<Card
									className={cn(
										'min-w-[300px]',
										// Card Background Colors
										(proposalRejected || proposalExpired || proposalBuyerAborted) && 'bg-destructive/10',
										proposalAccepted && 'bg-green-500/10',
										proposalPending && 'bg-background',
									)}>
									<CardHeader>
										<CardTitle className='text-accent flex items-center gap-2'>
											<RssIcon /> Tantovale Bot
										</CardTitle>
									</CardHeader>
									<CardContent>
										<div className='flex justify-between'>
											<div>
												😃 &nbsp;
												{isMsgSenderCurrentUser ? 'Your ' : 'You have a '}
												buy proposal
											</div>
											<p className='text-muted-foreground'>#{orderProposal.id}</p>
										</div>
										<p className='mt-3 italic'>&quot;{chatMessageProps.message}&quot;</p>
										<div className='mb-3 flex'>
											{isMsgSenderCurrentUser ? (
												<span className='flex gap-1'>
													You are offering <p className='font-bold'>{formatPrice(orderProposal.proposal_price)}€</p>
												</span>
											) : (
												<span className='flex gap-1'>
													<Link
														className='text-accent hover:underline'
														href={`/user/${chatMessageProps.sender.username}`}>
														{chatMessageProps.sender.username}
													</Link>{' '}
													is offering you <p className='font-bold'>{formatPrice(orderProposal.proposal_price)}€</p>
												</span>
											)}
										</div>
										<p className='text-muted-foreground/90 mt-2 italic'>
											This proposal will expire automatically in{' '}
											{formatDistanceToNow(addDays(new Date(orderProposal.created_at), 4))}
										</p>
									</CardContent>
									{/* Seller actions (when not chat owner and proposal is pending) */}
									{!isMsgSenderCurrentUser && proposalPending && (
										<CardFooter className='flex justify-between gap-2'>
											<>
												<Dialog>
													<DialogTrigger asChild>
														<Button
															variant='destructive'
															className='bg-destructive hover:bg-destructive/70 flex-1 font-bold'>
															Reject
														</Button>
													</DialogTrigger>
													<DialogContent>
														<DialogHeader>
															<DialogTitle>Reject Proposal</DialogTitle>
														</DialogHeader>
														<DialogDescription>Are you sure you want to reject this proposal?</DialogDescription>
														<DialogFooter>
															<Button variant='destructive' onClick={handleRejectProposal}>
																Reject
															</Button>
														</DialogFooter>
													</DialogContent>
												</Dialog>

												<Dialog>
													<DialogTrigger asChild>
														<Button variant='default' className='flex-1 bg-green-700 font-bold hover:bg-green-600'>
															Accept
														</Button>
													</DialogTrigger>
													<DialogContent>
														<DialogHeader>
															<DialogTitle>Accept Proposal</DialogTitle>
														</DialogHeader>
														<DialogDescription>Are you sure you want to accept this proposal?</DialogDescription>
														<DialogFooter>
															<Button
																variant='default'
																className='bg-green-700 font-bold hover:bg-green-600'
																onClick={handleAcceptProposal}>
																Accept
															</Button>
														</DialogFooter>
													</DialogContent>
												</Dialog>
											</>
										</CardFooter>
									)}
								</Card>
							</div>
						)}

						{!isOrderProposalLoading && orderProposalError && (
							<p className='text-destructive'>Error loading proposal</p>
						)}
					</>
				)}

				{isTextMessage && (
					<div
						className={cn(
							'rounded-lg px-3 py-2',
							isMsgSenderCurrentUser ? 'bg-primary text-primary-foreground' : 'bg-muted/80',
						)}>
						<p className='text-sm'>{chatMessageProps.message}</p>
					</div>
				)}

				{isSystemMessage && (
					<Card className='bg-background'>
						<CardHeader>
							<CardTitle className='text-accent flex items-center gap-2'>
								<RssIcon /> Tantovale Bot
							</CardTitle>
						</CardHeader>
						<CardContent>
							<p className='text-sm'>{chatMessageProps.message}</p>
							{proposalMetadata?.type === 'proposal_accepted' && !isMsgSenderCurrentUser && (
								<p className='text-sm'>
									You have 2 days to pay or the order will automatically expire.
									<br />
									Check your{' '}
									<Link href={`/auth/profile/orders?highlight=${proposalMetadata?.order_id}`} className='text-accent'>
										Orders page
									</Link>
									.
								</p>
							)}
							{proposalMetadata?.type === chatMessageMetadataValues.proposal_rejected && !isMsgSenderCurrentUser && (
								<p className='text-sm'>Your proposal has been rejected.</p>
							)}
							{proposalMetadata?.type === chatMessageMetadataValues.proposal_expired && !isMsgSenderCurrentUser && (
								<p className='text-sm'>Seller didn't answer, your proposal is expired.</p>
							)}
							{proposalMetadata?.type === chatMessageMetadataValues.proposal_buyer_aborted && (
								<p>Buyer aborted the proposal.</p>
							)}
						</CardContent>
					</Card>
				)}
				<div className='text-muted-foreground mt-1 flex items-center text-xs'>
					{formatDistanceToNow(new Date(chatMessageProps.created_at), {
						addSuffix: true,
					})}
				</div>
			</div>
		</div>
	);
}
