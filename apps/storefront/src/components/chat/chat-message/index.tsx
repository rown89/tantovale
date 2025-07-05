import Link from 'next/link';
import { formatDistanceToNow, addDays } from 'date-fns';
import { RssIcon } from 'lucide-react';

import { cn } from '@workspace/ui/lib/utils';
import { Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription } from '@workspace/ui/components/card';
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

export function ChatMessage({ message, item, isChatOwner }: ChatMessageProps) {
	const { orderProposal, isOrderProposalLoading, orderProposalError, updateProposal } = useChatMessageHook(message);

	const handleAcceptProposal = () => {
		if (!message.order_proposal_id) return;

		updateProposal.mutate({
			orderProposalId: message.order_proposal_id,
			item_id: item.id,
			status: 'accepted',
		});
	};

	const handleRejectProposal = () => {
		if (!message.order_proposal_id) return;

		updateProposal.mutate({
			orderProposalId: message.order_proposal_id,
			item_id: item.id,
			status: 'rejected',
		});
	};

	const isProposalMessage = message.order_proposal_id && message.message_type === 'proposal';
	const isSystemMessage = message.message_type === 'system';
	const isTextMessage = message.message_type === 'text';

	const proposalStatus = orderProposal?.status;

	return (
		<div className={cn('mb-4 flex items-start gap-2 break-all', isChatOwner ? 'flex-row-reverse' : 'flex-row')}>
			<div className={cn('flex max-w-[80%] flex-col', isChatOwner ? 'items-end' : 'items-start')}>
				{isProposalMessage && (
					<>
						{isOrderProposalLoading ? (
							<Spinner />
						) : (
							orderProposal &&
							!orderProposalError && (
								<div className='flex flex-col gap-2'>
									<Card
										className={cn(
											'min-w-[300px]',
											(proposalStatus === 'rejected' || proposalStatus === 'expired') && 'bg-destructive/10',
											proposalStatus === 'accepted' && 'bg-green-500/10',
											proposalStatus === 'pending' && 'bg-background',
										)}>
										<CardHeader>
											<CardTitle className='flex justify-between'>
												<div>
													😃 &nbsp;
													{isChatOwner ? 'Your ' : 'You have a buy '}
													proposal
												</div>
												<p className='text-muted-foreground'>#{orderProposal.id}</p>
											</CardTitle>
										</CardHeader>
										<CardContent>
											<p className='my-2 italic'>&quot;{message.message}&quot;</p>
											<div className='flex'>
												{isChatOwner ? (
													<span className='flex gap-1'>
														You are offering <p className='font-bold'>{formatPrice(orderProposal.proposal_price)}€</p>
													</span>
												) : (
													<span className='flex gap-1'>
														<Link className='text-accent hover:underline' href={`/user/${message.sender.username}`}>
															{message.sender.username}
														</Link>{' '}
														is offering you <p className='font-bold'>{formatPrice(orderProposal.proposal_price)}€</p>
													</span>
												)}
											</div>
											<p className='text-muted-foreground mt-2 italic'>
												* This proposal will expire automatically in{' '}
												{formatDistanceToNow(addDays(new Date(orderProposal.created_at), 7))}
											</p>
										</CardContent>
										<CardFooter
											className={cn(
												'flex gap-2',
												proposalStatus === 'pending' && !isChatOwner ? 'justify-between' : 'justify-center',
											)}>
											{/* Buyer actions (when not chat owner and proposal is pending) */}
											{!isChatOwner && proposalStatus === 'pending' && (
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
											)}

											{/* Proposal status */}
											<div className='flex w-full flex-col gap-2'>
												{/* Buyer view of status (when not pending) */}
												{!isChatOwner && proposalStatus !== 'pending' && (
													<span className='flex'>
														Proposal status:&nbsp;&nbsp;
														<p
															className={cn(
																'font-bold',
																proposalStatus === 'rejected' || proposalStatus === 'expired'
																	? 'text-destructive'
																	: 'text-green-500',
															)}>
															{proposalStatus}
														</p>
													</span>
												)}

												{/* Seller view of status (always shown) */}
												{isChatOwner && (
													<div className='flex gap-2'>
														<p className='text-foreground'>Proposal status:</p>
														<p
															className={cn(
																'font-bold',
																proposalStatus === 'rejected' || proposalStatus === 'expired'
																	? 'text-destructive'
																	: 'text-green-500',
															)}>
															{proposalStatus}
														</p>
													</div>
												)}
											</div>
										</CardFooter>
									</Card>
								</div>
							)
						)}
					</>
				)}

				{isTextMessage && (
					<div
						className={cn('rounded-lg px-3 py-2', isChatOwner ? 'bg-primary text-primary-foreground' : 'bg-muted/80')}>
						<p className='text-sm'>{message.message}</p>
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
							<p className='text-sm'>{message.message}</p>
							{message.message.includes('accepted') && !isChatOwner && (
								<p className='text-sm'>
									An order has been added to your{' '}
									<Link href='/auth/profile/orders' className='text-accent'>
										Orders.
									</Link>
									<br></br>
									You have 2 days to pay or the order will automatically expire.
								</p>
							)}
						</CardContent>
					</Card>
				)}
				<div className='text-muted-foreground mt-1 flex items-center text-xs'>
					{formatDistanceToNow(new Date(message.created_at), {
						addSuffix: true,
					})}
				</div>
			</div>
		</div>
	);
}
