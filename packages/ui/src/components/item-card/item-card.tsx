import React from 'react';
import Image from 'next/image';
import { Button } from '../button';
import { Card } from '../card';
import { Edit, Trash2, Share2 } from 'lucide-react';

import { format } from 'date-fns';

export interface Item {
	id: number;
	title: string;
	price: number;
	image: string;
	created_at: Date;
}

interface ItemCardProps {
	item: Item;
	onDelete: () => void;
	onEdit: () => void;
	onShare: () => void;
}

export function ItemCard({ item, onDelete, onEdit, onShare }: ItemCardProps) {
	return (
		<Card>
			<div className='flex flex-col sm:flex-row'>
				<div className='relative h-48 flex-shrink-0 sm:h-auto sm:w-48 md:w-64'>
					<Image src={item.image || '/placeholder.svg'} alt={item.title} fill className='object-cover' />
				</div>
				<div className='flex w-full flex-col justify-between gap-4 overflow-auto p-4'>
					<div>
						<div className='flex items-start justify-between gap-4'>
							<h3 className='truncate overflow-ellipsis break-all text-lg font-semibold'>{item.title}</h3>
							<p className='text-lg font-bold'>€{item.price.toFixed(2)}</p>
						</div>
						<p className='text-muted-foreground text-sm'>Created on {format(item.created_at, 'MMM d, yyyy')}</p>
					</div>
					<div className='mt-4 flex justify-end gap-2'>
						<Button variant='outline' size='sm' onClick={onEdit}>
							<Edit className='mr-1 h-4 w-4' />
							Edit
						</Button>
						<Button variant='outline' size='sm' onClick={onShare}>
							<Share2 className='mr-1 h-4 w-4' />
							Share
						</Button>
						<Button variant='destructive' size='sm' onClick={onDelete}>
							<Trash2 className='mr-1 h-4 w-4' />
							Delete
						</Button>
					</div>
				</div>
			</div>
		</Card>
	);
}
