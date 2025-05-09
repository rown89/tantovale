import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function formatPrice(amount: number) {
	return Number((amount / 100).toFixed(2));
}

export function formatPriceToCents(amount: number) {
	return amount * 100;
}
