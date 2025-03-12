'use client';

import React from 'react';

import { useState, useEffect } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { TouchBackend } from 'react-dnd-touch-backend';

// Custom hook to detect if the device is mobile
export function isMobile(): boolean {
	if (typeof window === 'undefined') return false;

	return window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;
}

// Custom hook to get the appropriate DnD backend based on device
export function useDndBackend() {
	const [backend, setBackend] = useState<any>(null);

	useEffect(() => {
		const mobile = isMobile();
		setBackend(mobile ? TouchBackend : HTML5Backend);
	}, []);

	return backend;
}

// DndProvider wrapper that automatically selects the appropriate backend
export function DndProviderWithBackend({ children }: { children: React.ReactNode }) {
	const [backend, setBackend] = useState<any>(null);

	useEffect(() => {
		const mobile = isMobile();
		setBackend(mobile ? TouchBackend : HTML5Backend);
	}, []);

	if (!backend) return <div>{children}</div>;

	return (
		<DndProvider backend={backend} options={{ enableMouseEvents: true }}>
			{children}
		</DndProvider>
	);
}
