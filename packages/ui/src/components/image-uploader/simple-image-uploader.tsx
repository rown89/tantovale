'use client';

import React from 'react';

import { useState, useCallback, useRef } from 'react';
import { cn } from '../../lib/utils';
import { Button } from '../button';
import { Card } from '../card';
import { AlertCircle, Upload, X, ImageIcon, ChevronUp, ChevronDown, ArrowUp } from 'lucide-react';
import { Alert, AlertDescription } from '../alert';

export type UploadedImage = {
	id: string;
	file: File;
	preview: string;
};

export type SimpleImageUploadProps = {
	onImagesChange?: (images: File[]) => void;
	maxImages?: number;
	maxSizeInMB?: number;
	acceptedFileTypes?: string[];
	className?: string;
	gridLayout?: boolean;
};

export default function SimpleImageUpload({
	onImagesChange,
	maxImages = 10,
	maxSizeInMB = 5,
	acceptedFileTypes = ['image/jpeg', 'image/png'],
	className,
	gridLayout = true,
}: SimpleImageUploadProps) {
	const [images, setImages] = useState<UploadedImage[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [isDraggingOver, setIsDraggingOver] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

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
			}));

			const updatedImages = [...images, ...newImages];
			setImages(updatedImages);

			// Call the onChange callback with the updated files
			if (onImagesChange) {
				onImagesChange(updatedImages.map((img) => img.file));
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

			// Call the onChange callback with the updated files
			if (onImagesChange) {
				onImagesChange(updatedImages.map((img) => img.file));
			}
		},
		[images, onImagesChange],
	);

	const moveImage = useCallback(
		(id: string, direction: 'up' | 'down') => {
			const index = images.findIndex((img) => img.id === id);
			if (index === -1) return;

			const newIndex = direction === 'up' ? Math.max(0, index - 1) : Math.min(images.length - 1, index + 1);

			if (newIndex === index) return;

			const updatedImages = [...images];
			const [movedItem] = updatedImages.splice(index, 1);
			if (movedItem) {
				updatedImages.splice(newIndex, 0, movedItem);
			}

			setImages(updatedImages);

			// Call the onChange callback with the updated files
			if (onImagesChange) {
				onImagesChange(updatedImages.map((img) => img.file));
			}
		},
		[images, onImagesChange],
	);

	return (
		<div className={cn('space-y-4', className)}>
			<div
				className={cn(
					'cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors',
					isDraggingOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50',
				)}
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
				onClick={() => fileInputRef.current?.click()}>
				<div className='flex flex-col items-center justify-center space-y-2'>
					<div className='bg-primary/10 rounded-full p-3'>
						<Upload className='text-primary h-6 w-6' />
					</div>
					<h3 className='text-lg font-medium'>
						{gridLayout ? 'Drag & drop images or click to browse' : 'Tap to add images'}
					</h3>
					<p className='text-muted-foreground text-sm'>
						Upload up to {maxImages} images (max {maxSizeInMB}MB each)
					</p>
					<p className='text-muted-foreground text-xs'>
						Supported formats: {acceptedFileTypes.map((type) => type.split('/')[1]).join(', ')}
					</p>
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
								{gridLayout ? (
									<>
										<ArrowUp className='mr-1 h-3 w-3' /> Use arrows to reorder
									</>
								) : (
									<>
										<ArrowUp className='mr-1 h-3 w-3' /> Use arrows to reorder
									</>
								)}
							</p>
						)}
					</div>

					{gridLayout ? (
						<div className='grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'>
							{images.map((image, index) => (
								<Card
									key={image.id}
									className='group relative aspect-square touch-none overflow-hidden transition-transform select-none'>
									<div className='absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100'>
										<div className='flex gap-1'>
											<Button
												variant='secondary'
												size='icon'
												className='h-8 w-8'
												disabled={index === 0}
												onClick={() => moveImage(image.id, 'up')}>
												<ChevronUp className='h-4 w-4' />
											</Button>
											<Button
												variant='secondary'
												size='icon'
												className='h-8 w-8'
												disabled={index === images.length - 1}
												onClick={() => moveImage(image.id, 'down')}>
												<ChevronDown className='h-4 w-4' />
											</Button>
											<Button
												variant='destructive'
												size='icon'
												className='h-8 w-8'
												onClick={() => removeImage(image.id)}>
												<X className='h-4 w-4' />
											</Button>
										</div>
									</div>
									<div className='absolute top-2 right-2 left-2 truncate rounded bg-black/60 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100'>
										{image.file.name}
									</div>
									<div className='bg-muted flex h-full w-full items-center justify-center'>
										{image.preview ? (
											<img
												src={image.preview || '/placeholder.svg'}
												alt={image.file.name}
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
							))}
						</div>
					) : (
						<div className='space-y-3'>
							{images.map((image, index) => (
								<div key={image.id} className='bg-muted flex touch-none items-center gap-3 rounded-lg p-2 select-none'>
									<div className='bg-muted h-16 w-16 flex-shrink-0 overflow-hidden rounded-md'>
										<img
											src={image.preview || '/placeholder.svg'}
											alt={image.file.name}
											className='pointer-events-none h-full w-full object-cover'
											draggable='false'
										/>
									</div>

									<div className='min-w-0 flex-1'>
										<p className='truncate text-sm font-medium'>{image.file.name}</p>
										<p className='text-muted-foreground text-xs'>{(image.file.size / 1024).toFixed(1)} KB</p>
									</div>

									<div className='flex flex-col gap-1'>
										<Button
											variant='ghost'
											size='icon'
											className='h-7 w-7'
											disabled={index === 0}
											onClick={() => moveImage(image.id, 'up')}>
											<ChevronUp className='h-4 w-4' />
											<span className='sr-only'>Move up</span>
										</Button>

										<Button
											variant='ghost'
											size='icon'
											className='h-7 w-7'
											disabled={index === images.length - 1}
											onClick={() => moveImage(image.id, 'down')}>
											<ChevronDown className='h-4 w-4' />
											<span className='sr-only'>Move down</span>
										</Button>
									</div>

									<Button
										variant='ghost'
										size='icon'
										className='text-destructive hover:text-destructive h-8 w-8'
										onClick={() => removeImage(image.id)}>
										<X className='h-4 w-4' />
										<span className='sr-only'>Remove</span>
									</Button>
								</div>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
