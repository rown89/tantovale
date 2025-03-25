'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { Share2, EyeClosed, Ellipsis, DeleteIcon } from 'lucide-react';

import { SelectItem } from '@workspace/database/schemas/schema';

export type Item = Pick<SelectItem, 'id' | 'price' | 'title' | 'published'> & {
	image: string;
	created_at: Date;
};

interface ItemCardProps {
	item: Item;
	onDelete: () => void;
	onEdit: () => void;
	onShare: () => void;
	onUnpubish: () => void;
}

export function ItemCard({ item, onDelete, onEdit, onShare, onUnpubish }: ItemCardProps) {
	const isMobile = useIsMobile();
	const [isDialogOpen, setIsDialogOpen] = useState<{
		isOpen: boolean;
		type?: 'delete' | 'edit' | 'share' | 'unpublish';
	}>({
		isOpen: false,
		type: undefined,
	});

	const dialogRef = useRef<HTMLDivElement>(null);

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
					<Image className='bject-cover' priority src={item.image || '/placeholder.svg'} alt={item.title} fill />
				</div>
				<div className='flex w-full flex-col justify-between gap-4 overflow-auto p-4'>
					<>
						<div className='flex items-start justify-between gap-4'>
							<Link className='hover:text-accent' href={`/item/${item.id}`}>
								<h3 className='truncate overflow-ellipsis break-all text-lg font-semibold'>{item.title}</h3>
							</Link>
							<p className='text-lg font-bold'>€{item.price.toFixed(2)}</p>
						</div>
						<p className='text-muted-foreground text-sm'>Created on {format(item.created_at, 'MMM d, yyyy')}</p>
					</>

					<div className='mt-4 flex justify-between gap-2'>
						{
							<AlertDialog open={isDialogOpen.isOpen}>
								{isMobile ? (
									<>
										{item.published ? (
											<Button
												variant='outline'
												size='sm'
												onClick={() => {
													setIsDialogOpen({
														isOpen: true,
														type: 'share',
													});
												}}>
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
												<DropdownMenuItem
													onClick={() => {
														setIsDialogOpen({
															isOpen: true,
															type: 'edit',
														});
													}}>
													Edit
												</DropdownMenuItem>
												<DropdownMenuSeparator />
												{item.published && (
													<DropdownMenuItem
														onClick={() => {
															setIsDialogOpen({
																isOpen: true,
																type: 'unpublish',
															});
														}}>
														Unpublish
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
													Delete
												</DropdownMenuItem>
											</DropdownMenuContent>
										</DropdownMenu>
									</>
								) : (
									<div className='flex w-full justify-end gap-3'>
										<div className='flex w-full justify-between'>
											{item.published ? (
												<Button
													variant='outline'
													size='sm'
													onClick={() =>
														setIsDialogOpen({
															isOpen: true,
															type: 'share',
														})
													}>
													<Share2 className='mr-1 h-4 w-4' />
													Share
												</Button>
											) : (
												<div />
											)}
											<div className='flex gap-3'>
												<Button
													variant='outline'
													size='sm'
													onClick={() => {
														setIsDialogOpen({
															isOpen: true,
															type: 'edit',
														});
													}}>
													<EyeClosed className='mr-1 h-4 w-4' />
													Edit
												</Button>
												{item.published && (
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
										<AlertDialogTitle>
											{isDialogOpen.type !== 'share' ? 'Are you absolutely sure?' : 'Share'}
										</AlertDialogTitle>
										<AlertDialogDescription>
											This action cannot be undone. This will permanently delete your account and remove your data from
											our servers.
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
											className='bg-secondary hover:bg-secondary/80 font-bold text-black'
											onClick={() => {
												if (isDialogOpen.type === 'edit') onEdit();
												if (isDialogOpen.type === 'unpublish') onUnpubish();
												if (isDialogOpen.type === 'delete') onDelete();
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
