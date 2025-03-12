'use client';
import React from 'react';
import { useEffect, useState } from 'react';
import MultiImageUpload from './multi-image-uploader';
import MobileImageUpload from './mobile-image-uploader';
import { isMobile } from '../../hooks/use-mobile-dnd';

export type ResponsiveImageUploadProps = {
	onImagesChange?: (images: File[]) => void;
	maxImages?: number;
	maxSizeInMB?: number;
	acceptedFileTypes?: string[];
	className?: string;
};

export default function ResponsiveImageUpload(props: ResponsiveImageUploadProps) {
	const [isMobileView, setIsMobileView] = useState(false);

	useEffect(() => {
		setIsMobileView(isMobile());

		const handleResize = () => {
			setIsMobileView(isMobile());
		};

		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	}, []);

	if (isMobileView) {
		return <MobileImageUpload {...props} />;
	}

	return <MultiImageUpload {...props} />;
}
