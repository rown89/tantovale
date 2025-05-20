'use client';

import React, { useEffect } from 'react';

import { useState, useCallback, useRef } from 'react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { TouchBackend } from 'react-dnd-touch-backend';
import { cn } from '../../lib/utils';
import { Button } from '../button';
import { Card } from '../card';
import { AlertCircle, Upload, X, ImageIcon, Move } from 'lucide-react';
import { Alert, AlertDescription } from '../alert';
import { useIsMobile } from '../../hooks';
import { Input } from '../input';

export type UploadedImage = {
	id: string;
	file?: File;
	preview: string;
	isExternalUrl?: boolean;
	url?: string;
};

export type MultiImageUploadProps = {
	fileInputRef: React.RefObject<HTMLInputElement | null>;
	onImagesChange?: (images: File[]) => void;
	maxImages?: number;
	maxSizeInMB?: number;
	acceptedFileTypes?: string[];
	className?: string;
	initialImageUrls?: string[];
	initialImages?: File[];
	isError?: boolean;
};

export default function MultiImageUpload({
	fileInputRef,
	onImagesChange,
	maxImages = 5,
	maxSizeInMB = 5,
	acceptedFileTypes = ['image/jpeg', 'image/png'],
	className,
	initialImageUrls = [],
	initialImages = [],
	isError = false,
}: MultiImageUploadProps) {
	const [useTouchBackend, setUseTouchBackend] = useState(false);
	const [images, setImages] = useState<UploadedImage[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [isDraggingOver, setIsDraggingOver] = useState(false);
	const isMobile = useIsMobile();

	// Process initialImages if provided (used for form state persistence)
	useEffect(() => {
		if (initialImages.length > 0 && images.length === 0) {
			const fileImages = initialImages.map((file) => ({
				id: crypto.randomUUID(),
				file,
				preview: URL.createObjectURL(file),
				isExternalUrl: false,
			}));

			// Check if adding these files would exceed the maximum
			if (fileImages.length > maxImages) {
				setError(`You can only have a maximum of ${maxImages} images`);
				// Still load up to the maximum
				setImages(fileImages.slice(0, maxImages));
			} else {
				setImages(fileImages);
			}

			// Call the onChange callback to ensure form state is updated
			if (onImagesChange) {
				onImagesChange(initialImages.slice(0, maxImages));
			}
		}
	}, [initialImages, maxImages, images.length, onImagesChange]);

	// Load initial image URLs when component mounts
	useEffect(() => {
		// Only process initial URLs if we don't already have images loaded
		if (initialImageUrls.length > 0 && images.length === 0) {
			const urlImages = initialImageUrls.map((url) => ({
				id: crypto.randomUUID(),
				preview: url,
				isExternalUrl: true,
				url: url,
			}));

			// Check if adding these files would exceed the maximum
			if (urlImages.length > maxImages) {
				setError(`You can only have a maximum of ${maxImages} images`);
				// Still load up to the maximum
				setImages(urlImages.slice(0, maxImages));
			} else {
				setImages(urlImages);
			}

			// Call the onChange callback with the updated files/urls
			if (onImagesChange) {
				// @ts-expect-error this must be checked
				onImagesChange(initialImageUrls);
			}
		}
	}, [initialImageUrls, maxImages, onImagesChange, images.length]);

	const handleFileChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const selectedFiles = Array.from(e.target.files || []);

			// Reset error
			setError(null);

			// Check if adding these files would exceed the maximum
			if (images.length + selectedFiles.length > maxImages) {
				setError(`You can only upload a maximum of ${maxImages} images`);
				return;
			}

			// Validate files
			const validFiles: File[] = [];
			const invalidFiles: string[] = [];

			selectedFiles.forEach((file) => {
				// Check file type
				if (!acceptedFileTypes.includes(file.type)) {
					invalidFiles.push(`${file.name} (invalid type)`);
					return;
				}

				// Check file size
				if (file.size > maxSizeInMB * 1024 * 1024) {
					invalidFiles.push(`${file.name} (exceeds ${maxSizeInMB}MB)`);
					return;
				}

				validFiles.push(file);
			});

			if (invalidFiles.length > 0) {
				setError(`Could not upload: ${invalidFiles.join(', ')}`);
			}

			if (validFiles.length === 0) return;

			// Add valid files to state
			const newImages = validFiles.map((file) => ({
				id: crypto.randomUUID(),
				file,
				preview: URL.createObjectURL(file),
				isExternalUrl: false,
			}));

			const updatedImages = [...images, ...newImages];
			setImages(updatedImages);

			// Call the onChange callback with the updated files/urls
			if (onImagesChange) {
				// Create a mixed array of Files and URL strings
				// @ts-expect-error this must be checked
				const mixedData = updatedImages.map((img) => (img.isExternalUrl ? img.url! : img.file!));
				onImagesChange(mixedData);
			}

			// Reset the file input
			if (fileInputRef.current) {
				fileInputRef.current.value = '';
			}
		},
		[images, maxImages, maxSizeInMB, acceptedFileTypes, onImagesChange],
	);

	const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		setIsDraggingOver(true);
	}, []);

	const handleDragLeave = useCallback(() => {
		setIsDraggingOver(false);
	}, []);

	const handleDrop = useCallback(
		(e: React.DragEvent<HTMLDivElement>) => {
			e.preventDefault();
			setIsDraggingOver(false);

			if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
				const dataTransfer = new DataTransfer();
				Array.from(e.dataTransfer.files).forEach((file) => {
					dataTransfer.items.add(file);
				});

				const event = {
					target: {
						files: dataTransfer.files,
					},
				} as unknown as React.ChangeEvent<HTMLInputElement>;

				handleFileChange(event);
			}
		},
		[handleFileChange],
	);

	const removeImage = useCallback(
		(id: string) => {
			const updatedImages = images.filter((image) => image.id !== id);
			setImages(updatedImages);

			// Call the onChange callback with the updated files/urls
			if (onImagesChange) {
				// Create a mixed array of Files and URL strings
				const mixedData = updatedImages.map((img) => (img.isExternalUrl ? img.url! : img.file!));
				// @ts-expect-error this must be checked
				onImagesChange(mixedData);
			}
		},
		[images, onImagesChange],
	);

	const moveImage = useCallback(
		(dragIndex: number, hoverIndex: number) => {
			const draggedImage = images[dragIndex];
			if (!draggedImage) return;
			const updatedImages = [...images];

			// Remove the dragged item
			updatedImages.splice(dragIndex, 1);
			// Insert it at the new position
			updatedImages.splice(hoverIndex, 0, draggedImage);

			setImages(updatedImages);

			// Call the onChange callback with the updated files/urls
			if (onImagesChange) {
				// Create a mixed array of Files and URL strings
				const mixedData = updatedImages.map((img) => (img.isExternalUrl ? img.url! : img.file!));
				// @ts-expect-error this must be checked
				onImagesChange(mixedData);
			}
		},
		[images, onImagesChange],
	);

	// Choose the appropriate backend
	const backend = useTouchBackend ? TouchBackend : HTML5Backend;
	const backendOptions = useTouchBackend ? { enableMouseEvents: true } : {};

	useEffect(() => {
		setUseTouchBackend(isMobile);

		const handleResize = () => {
			setUseTouchBackend(isMobile);
		};

		window.addEventListener('resize', handleResize);
		return () => {
			window.removeEventListener('resize', handleResize);
		};
	}, [isMobile]);

	// Clean up effect will run when component unmounts or images change
	useEffect(() => {
		return () => {
			// Clean up object URLs to prevent memory leaks
			images.forEach((image) => {
				if (!image.isExternalUrl && image.preview) {
					URL.revokeObjectURL(image.preview);
				}
			});
		};
	}, [images]);

	return (
		<div className={cn('space-y-4', className)}>
			{images.length === 0 && (
				<div
					className={cn(
						'cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors',
						isDraggingOver
							? 'border-primary bg-primary/5'
							: isError
								? 'border-destructive bg-destructive/5'
								: 'border-muted-foreground/25 hover:border-primary/50',
					)}
					onDragOver={handleDragOver}
					onDragLeave={handleDragLeave}
					onDrop={handleDrop}
					onClick={() => fileInputRef.current?.click()}>
					<div className='flex flex-col items-center justify-center space-y-2'>
						<div className='bg-primary/10 rounded-full p-3'>
							<Upload className='text-primary h-4 w-4' />
						</div>
						<h3 className='text-lg font-medium'>Drag & drop images or click to browse</h3>
						<p className='text-muted-foreground text-sm'>Upload up to {maxImages} images</p>
					</div>
					<Input
						ref={fileInputRef}
						type='file'
						multiple
						accept={acceptedFileTypes.join(',')}
						className='hidden'
						onChange={(e) => {
							handleFileChange(e);
						}}
					/>
				</div>
			)}

			{error && (
				<Alert variant='destructive'>
					<AlertCircle className='h-4 w-4' />
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			{images.length > 0 && (
				<div className='space-y-2'>
					<div className='flex items-center justify-between'>
						<h3 className='text-sm font-medium'>
							Uploaded Images ({images.length}/{maxImages})
						</h3>
						{images.length > 1 && (
							<p className='text-muted-foreground flex items-center text-xs'>
								<Move className='mr-1 h-3 w-3' /> Drag to reorder
							</p>
						)}
					</div>

					<DndProvider backend={backend} options={backendOptions}>
						<div
							className={cn(
								'grid grid-cols-4 gap-4',
								isError && 'border-destructive bg-destructive/5 rounded-lg border-2 border-dashed p-4',
							)}>
							{images.map((image, index) => (
								<DraggableImageItem
									key={image.id}
									id={image.id}
									index={index}
									preview={image.preview}
									filename={
										image.file?.name || (image.isExternalUrl ? getFileNameFromUrl(image.url || '') : 'External image')
									}
									moveImage={moveImage}
									removeImage={removeImage}
								/>
							))}

							{images.length < maxImages && (
								<div
									className={cn(
										'flex cursor-pointer justify-center rounded-lg border-2 border-dashed p-2 text-center transition-colors',
										isDraggingOver
											? 'border-primary bg-primary/5'
											: isError
												? 'border-destructive'
												: 'border-muted-foreground/25 hover:border-primary/50',
									)}
									onDragOver={handleDragOver}
									onDragLeave={handleDragLeave}
									onDrop={handleDrop}
									onClick={() => fileInputRef.current?.click()}>
									<div className='flex flex-col items-center justify-center space-y-2'>
										<Upload className='text-primary h-6 w-6' />
									</div>
									<input
										ref={fileInputRef}
										type='file'
										multiple
										accept={acceptedFileTypes.join(',')}
										className='hidden'
										onChange={handleFileChange}
									/>
								</div>
							)}
						</div>
					</DndProvider>
				</div>
			)}
		</div>
	);
}

// Helper function to extract filename from URL
function getFileNameFromUrl(url: string): string {
	try {
		const pathname = new URL(url).pathname;
		const filename = pathname.split('/').pop() || 'image';
		// Remove any query parameters
		return filename.split('?')[0] || 'image';
	} catch (e) {
		return 'External image';
	}
}

type DraggableImageItemProps = {
	id: string;
	index: number;
	preview: string;
	filename: string;
	moveImage: (dragIndex: number, hoverIndex: number) => void;
	removeImage: (id: string) => void;
};

const DraggableImageItem = ({ id, index, preview, filename, moveImage, removeImage }: DraggableImageItemProps) => {
	const ref = useRef<HTMLDivElement>(null);

	const [{ isDragging }, drag] = useDrag({
		type: 'IMAGE_ITEM',
		item: { id, index },
		collect: (monitor) => ({
			isDragging: monitor.isDragging(),
		}),
	});

	const [{ isOver }, drop] = useDrop({
		accept: 'IMAGE_ITEM',
		hover: (item: { id: string; index: number }, monitor) => {
			if (!ref.current) {
				return;
			}

			const dragIndex = item.index;
			const hoverIndex = index;

			// Don't replace items with themselves
			if (dragIndex === hoverIndex) {
				return;
			}

			// Determine rectangle on screen
			const hoverBoundingRect = ref.current.getBoundingClientRect();

			// Get horizontal middle
			const hoverMiddleX = (hoverBoundingRect.right - hoverBoundingRect.left) / 2;

			// Get vertical middle
			const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;

			// Determine mouse position
			const clientOffset = monitor.getClientOffset();

			if (!clientOffset) {
				return;
			}

			// Get pixels to the top
			const hoverClientX = clientOffset.x - hoverBoundingRect.left;
			const hoverClientY = clientOffset.y - hoverBoundingRect.top;

			// For mobile, we want to be more lenient with the drag threshold
			const dragThreshold = 0.3; // 30% threshold for all devices

			// Only perform the move when the mouse has crossed the threshold
			// When dragging horizontally
			if (dragIndex < hoverIndex && hoverClientX < hoverMiddleX * dragThreshold) {
				return;
			}
			if (dragIndex > hoverIndex && hoverClientX > hoverMiddleX * (2 - dragThreshold)) {
				return;
			}

			// When dragging vertically
			if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY * dragThreshold) {
				return;
			}
			if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY * (2 - dragThreshold)) {
				return;
			}

			moveImage(dragIndex, hoverIndex);

			// Note: we're mutating the monitor item here!
			// Generally it's better to avoid mutations,
			// but it's good here for the sake of performance
			// to avoid expensive index searches.
			item.index = hoverIndex;
		},
		collect: (monitor) => ({
			isOver: monitor.isOver(),
		}),
	});

	drag(drop(ref));

	return (
		<Card
			ref={ref}
			className={cn(
				'group relative aspect-square touch-none select-none overflow-hidden transition-transform',
				isDragging ? 'z-10 scale-95 opacity-50 shadow-lg' : 'opacity-100',
				isOver ? 'border-primary' : '',
			)}>
			<div className='absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100'>
				<Button
					variant='destructive'
					size='icon'
					className='h-8 w-8'
					onClick={(e) => {
						e.stopPropagation();
						removeImage(id);
					}}>
					<X className='h-4 w-4' />
				</Button>
			</div>
			<div className='absolute left-2 right-2 top-2 truncate rounded bg-black/60 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100'>
				{filename}
			</div>
			<div className='bg-muted flex h-full w-full items-center justify-center'>
				{preview ? (
					<img
						src={preview || '/placeholder.svg'}
						alt={filename}
						className='pointer-events-none h-full w-full object-cover'
						draggable='false'
					/>
				) : (
					<div className='text-muted-foreground flex flex-col items-center justify-center'>
						<ImageIcon className='h-8 w-8' />
						<span className='mt-1 text-xs'>Preview unavailable</span>
					</div>
				)}
			</div>
		</Card>
	);
};
