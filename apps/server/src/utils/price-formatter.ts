export function formatPrice(amount: number) {
	return Number((amount / 100).toFixed(2));
}

export function formatPriceToCents(amount: number) {
	return amount * 100;
}
