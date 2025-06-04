'use client';

import React from 'react';
import { useState } from 'react';
import { Check, Copy, Mail } from 'lucide-react';

import { linkBuilder } from '@workspace/shared/utils/linkBuilder';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../dialog';
import { Button } from '../button';
import { Input } from '../input';

interface ShareModalProps {
	isOpen: boolean;
	onClose: () => void;
	item: {
		id: string;
		title: string;
	};
}

export function ShareSocialModal({ isOpen, onClose, item }: ShareModalProps) {
	const [copied, setCopied] = useState(false);

	// In a real app, this would be your actual domain
	const baseUrl = `https://tantovale.it/item`;

	const shareUrl = `${baseUrl}/${linkBuilder({
		id: Number(item.id),
		title: item.title,
	})}`;

	const shareText = `Check out this item: ${item.title}`;

	const shareLinks = [
		{
			name: 'WhatsApp',
			icon: (
				<svg
					xmlns='http://www.w3.org/2000/svg'
					width='24'
					height='24'
					viewBox='0 0 24 24'
					fill='none'
					stroke='currentColor'
					strokeWidth='2'
					strokeLinecap='round'
					strokeLinejoin='round'
					className='text-green-600'>
					<path d='M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21' />
					<path d='M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1Z' />
					<path d='M14 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1Z' />
					<path d='M9.5 13.5c.5 1.5 2.5 2 4 1' />
				</svg>
			),
			url: `https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`,
			color: 'bg-green-50 hover:bg-green-100 border-green-200',
		},
		{
			name: 'Telegram',
			icon: (
				<svg
					xmlns='http://www.w3.org/2000/svg'
					width='24'
					height='24'
					viewBox='0 0 24 24'
					fill='none'
					stroke='currentColor'
					strokeWidth='2'
					strokeLinecap='round'
					strokeLinejoin='round'
					className='text-blue-500'>
					<path d='m22 2-7 20-4-9-9-4Z' />
					<path d='M22 2 11 13' />
				</svg>
			),
			url: `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`,
			color: 'bg-blue-50 hover:bg-blue-100 border-blue-200',
		},
		{
			name: 'Email',
			icon: <Mail className='text-gray-600' />,
			url: `mailto:?subject=${encodeURIComponent(`Sharing: ${item.title}`)}&body=${encodeURIComponent(`${shareText} ${shareUrl}`)}`,
			color: 'bg-gray-50 hover:bg-gray-100 border-gray-200',
		},
	];

	const copyToClipboard = async () => {
		try {
			await navigator.clipboard.writeText(shareUrl);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch (err) {
			console.error('Failed to copy: ', err);
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent className='max-w-[500px] break-all'>
				<DialogHeader>
					<DialogTitle>Share</DialogTitle>
					<DialogDescription>
						<span className='text-accent'>{item.title}</span>
						<span> with your friends!</span>
					</DialogDescription>
				</DialogHeader>

				<div className='mt-4 flex items-center gap-2'>
					<div className='grid flex-1 gap-2'>
						<Input readOnly value={shareUrl} className='w-full' />
					</div>
					<Button type='button' variant='outline' size='sm' className='px-3' onClick={copyToClipboard}>
						{copied ? <Check className='h-4 w-4' /> : <Copy className='h-4 w-4' />}
						<span className='sr-only'>Copy</span>
					</Button>
				</div>

				<div className='mt-6'>
					<h4 className='py-3 text-sm font-medium'>Share on social media</h4>

					<div className='grid grid-cols-4 gap-2'>
						{shareLinks.map((link) => (
							<a
								key={link.name}
								href={link.url}
								target='_blank'
								rel='noopener noreferrer'
								className={`hover:bg-foreground/10 flex flex-col items-center justify-center rounded-lg border p-3 transition-colors`}>
								{link.icon}
								<span className='text-foreground mt-1 text-xs'>{link.name}</span>
							</a>
						))}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
