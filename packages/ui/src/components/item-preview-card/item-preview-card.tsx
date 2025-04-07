'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { format } from 'date-fns';
import { Button } from '../button';
import { Card } from '../card';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '../dropdown-menu';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@workspace/ui/components/alert-dialog';
import { useIsMobile } from '../../hooks';
import { Share2, EyeClosed, Ellipsis, DeleteIcon, Pencil, EyeIcon } from 'lucide-react';

export type Item = {
	id: number;
	price: number;
	title: string;
	published: boolean;
	image: string;
	link: string;
	created_at: Date;
};

interface ItemCardProps {
	item: Item;
	onDelete: () => void;
	onEdit: () => void;
	onShare: () => void;
	onPublish: () => void;
	onUnpubish: () => void;
}

export function ItemPreviewCard({ item, onDelete, onEdit, onShare, onPublish, onUnpubish }: ItemCardProps) {
	const dialogRef = useRef<HTMLDivElement>(null);
	const isMobile = useIsMobile();
	const [isDialogOpen, setIsDialogOpen] = useState<{
		isOpen: boolean;
		type?: 'delete' | 'unpublish' | 'publish';
	}>({
		isOpen: false,
		type: undefined,
	});

	useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			if (dialogRef.current && !dialogRef.current.contains(event.target as Node)) {
				setIsDialogOpen({
					...isDialogOpen,
					isOpen: false,
				});
			}
		}

		document.addEventListener('mousedown', handleClickOutside);
		return () => {
			// Unbind the event listener on clean up
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, [isDialogOpen]);

	return (
		<Card className={`${!item.published ? 'border-2 border-dashed bg-transparent' : ''}`}>
			<div className='flex flex-col sm:flex-row'>
				<div className='relative h-48 flex-shrink-0 sm:h-auto sm:w-48 md:w-64'>
					<Link href={`${item.link}`} className='relative block h-full min-h-[160px]'>
						<Image
							className='h-full object-cover'
							fill
							priority
							src={item.image || '/placeholder.svg'}
							sizes='(max-width: 720px) 230px,
							256px'
							alt={item.title}
						/>
					</Link>
				</div>
				<div className='flex w-full flex-col justify-between gap-4 overflow-auto p-4'>
					<>
						<div className='flex flex-col items-start justify-between gap-4 xl:flex-row'>
							<Link
								className='hover:text-accent inline-grid w-full hover:underline xl:max-w-[80%]'
								href={`${item.link}`}>
								<h3 className='truncate break-all text-lg font-semibold'>{item.title}</h3>
							</Link>
							<p className='flex w-full items-center justify-end gap-1 text-lg font-medium xl:w-auto'>
								<span className='italic'>€</span>
								{(item.price / 100).toFixed(2)}
							</p>
						</div>
						<p className='text-muted-foreground text-sm'>Created on {format(item.created_at, 'MMM d, yyyy')}</p>
					</>

					<div className='mt-4 flex justify-between gap-2'>
						{
							<AlertDialog open={isDialogOpen.isOpen}>
								{isMobile ? (
									<>
										{item.published ? (
											<Button variant='outline' size='sm' onClick={onShare}>
												<Share2 className='mr-1 h-4 w-4' />
												Share
											</Button>
										) : (
											<div />
										)}
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button variant='outline'>
													<Ellipsis />
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent className='w-56'>
												<DropdownMenuItem onClick={() => onEdit()}>
													<Pencil className='mr-1 h-4 w-4' />
													Edit
												</DropdownMenuItem>
												<DropdownMenuSeparator />
												{item.published ? (
													<DropdownMenuItem
														onClick={() => {
															setIsDialogOpen({
																isOpen: true,
																type: 'unpublish',
															});
														}}>
														<EyeClosed className='mr-1 h-4 w-4' />
														Unpublish
													</DropdownMenuItem>
												) : (
													<DropdownMenuItem
														onClick={() => {
															setIsDialogOpen({
																isOpen: true,
																type: 'publish',
															});
														}}>
														<EyeIcon className='mr-1 h-4 w-4' />
														Publish
													</DropdownMenuItem>
												)}
												<DropdownMenuSeparator />
												<DropdownMenuItem
													variant='destructive'
													onClick={() => {
														setIsDialogOpen({
															isOpen: true,
															type: 'delete',
														});
													}}>
													<DeleteIcon className='mr-1 h-4 w-4' />
													Delete
												</DropdownMenuItem>
											</DropdownMenuContent>
										</DropdownMenu>
									</>
								) : (
									<div className='flex w-full justify-end gap-3'>
										<div className='flex w-full justify-between'>
											{item.published ? (
												<Button variant='outline' size='sm' onClick={onShare}>
													<Share2 className='mr-1 h-4 w-4' />
													Share
												</Button>
											) : (
												<div />
											)}
											<div className='flex gap-3'>
												<Button variant='outline' size='sm' onClick={() => onEdit()}>
													<Pencil className='mr-1 h-4 w-4' />
													Edit
												</Button>
												{item.published ? (
													<Button
														variant='outline'
														size='sm'
														onClick={() => {
															setIsDialogOpen({
																isOpen: true,
																type: 'unpublish',
															});
														}}>
														<EyeClosed className='mr-1 h-4 w-4' />
														Unpublish
													</Button>
												) : (
													<Button
														variant='outline'
														size='sm'
														onClick={() => {
															setIsDialogOpen({
																isOpen: true,
																type: 'publish',
															});
														}}>
														{' '}
														<EyeIcon className='mr-1 h-4 w-4' />
														Publish
													</Button>
												)}
												<Button
													variant='destructive'
													size='sm'
													onClick={() => {
														setIsDialogOpen({
															isOpen: true,
															type: 'delete',
														});
													}}>
													<DeleteIcon className='mr-1 h-4 w-4' />
													Delete
												</Button>
											</div>
										</div>
									</div>
								)}

								<AlertDialogContent ref={dialogRef}>
									<AlertDialogHeader>
										<AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
										<AlertDialogDescription>
											{isDialogOpen.type === 'delete' &&
												'This action cannot be undone. This will permanently delete your items.'}
											{isDialogOpen.type === 'unpublish' && 'You are going to unpublish your items.'}
										</AlertDialogDescription>
									</AlertDialogHeader>

									<AlertDialogFooter>
										<AlertDialogCancel
											onClick={() =>
												setIsDialogOpen({
													...isDialogOpen,
													isOpen: false,
												})
											}>
											Cancel
										</AlertDialogCancel>
										<AlertDialogAction
											className={`bg-secondary hover:bg-secondary/80 ${isDialogOpen.type === 'delete' && 'bg-destructive hover:bg-destructive/80'} font-bold text-black`}
											onClick={() => {
												if (isDialogOpen.type === 'unpublish') onUnpubish();
												if (isDialogOpen.type === 'publish') onPublish();
												if (isDialogOpen.type === 'delete') onDelete();

												setIsDialogOpen({
													type: undefined,
													isOpen: false,
												});
											}}>
											Confirm
										</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						}
					</div>
				</div>
			</div>
		</Card>
	);
}
