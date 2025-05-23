'use client';

import React, { ReactNode } from 'react';
import { Card, CardContent } from '@workspace/ui/components/card';
import Slider from '@workspace/ui/components/carousel/slider';
import { Button } from '@workspace/ui/components/button';
import { MapPin, Truck } from 'lucide-react';
import { Badge } from '@workspace/ui/components/badge';

export interface ItemDetailCardrops {
	isPreview?: boolean;
	isCompact?: boolean;
	imagesRef?: React.RefObject<HTMLInputElement | null>;
	maxImages?: number;
	item: {
		id?: number;
		title: string;
		price: number;
		description?: string;
		location: {
			city: {
				id: number;
				name: string;
			};
			province: {
				id: number;
				name: string;
			};
		};
		images: ReactNode[];
		subcategory?: ReactNode;
		condition?: ReactNode;
		deliveryMethods?: string;
	};
}

export const ItemDetailCard = React.memo(
	({ isPreview = false, isCompact = false, item, imagesRef, maxImages }: ItemDetailCardrops) => {
		const { title, price, description, location, images, condition, subcategory } = item;

		const formattedPrice = price ? (price / 100).toFixed(2) : '0.00';

		return (
			<div className='h-full w-full overflow-hidden'>
				<Card className='border-1 shadow-md transition-all duration-300 hover:shadow-lg'>
					<CardContent className='relative flex flex-col justify-between p-6'>
						<div className='flex flex-col gap-2'>
							<div className='bg-background/50 mb-3 flex min-h-[450px] w-full flex-col items-center justify-center rounded-t-md'>
								{images && images.length ? (
									<Slider images={images} />
								) : isPreview ? (
									<div className='flex flex-col gap-2'>
										<Button onClick={() => imagesRef && imagesRef?.current?.click()}>Upload</Button>
										<p className='text-muted-foreground'>Upload up to {maxImages} images</p>
									</div>
								) : null}
							</div>

							<div className='flex items-start justify-between gap-5'>
								<h1 className='break-all text-2xl font-bold'>{title || 'Your item title...'}</h1>
							</div>

							<div className='flex flex-col items-start gap-2 md:flex-row md:items-center md:justify-between'>
								<div className='text-muted-foreground flex items-center gap-1.5'>
									<MapPin className='h-4 w-4' />
									<span className='text-sm font-medium'>{location.city.name || 'Location'}</span>
								</div>

								<div className='flex items-center gap-1'>
									{item.deliveryMethods ? (
										<div>
											<Badge variant='outline' className='font-normal'>
												<span className='flex items-center gap-1'>
													<Truck className='h-3 w-3' /> {item.deliveryMethods}
												</span>
											</Badge>
										</div>
									) : isPreview ? (
										<Badge variant='outline' className='font-normal'>
											<span className='flex items-center gap-1'>Delivery mode</span>
										</Badge>
									) : null}

									<Badge className='px-3 py-1 text-lg font-semibold'>€{formattedPrice}</Badge>
								</div>
							</div>

							{condition && condition && (
								<div className='flex justify-between gap-2'>
									<div className='flex gap-2'>
										{/* Subcategory Badge */}
										{subcategory && subcategory}
										{/* Condition */}
										{condition && condition}
									</div>
								</div>
							)}
							{!isCompact && description && (
								<div
									className={`whitespace-pre-wrap text-[17px] ${isPreview ? 'max-h-80' : ''} overflow-auto break-all text-slate-600 dark:text-slate-400`}>
									{description || 'Your item description will appear here...'}
								</div>
							)}
						</div>
					</CardContent>
				</Card>
			</div>
		);
	},
	(prevProps, nextProps) => {
		// Only re-render if any of these props have changed
		return prevProps.item === nextProps.item;
	},
);

// Add display name for debugging
ItemDetailCard.displayName = 'ItemDetailCard';
