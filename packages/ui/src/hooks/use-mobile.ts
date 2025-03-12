'use client';

export function isMobile(): boolean {
	if (typeof window === 'undefined') return false;

	// Check for touch capability
	const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || (navigator as any).msMaxTouchPoints > 0;

	// Check for small screen
	const isSmallScreen = window.innerWidth < 768;

	// Check for mobile user agent (less reliable but can help)
	const mobileUserAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

	// Consider it mobile if it has touch capability AND either has a small screen or mobile user agent
	return hasTouch && (isSmallScreen || mobileUserAgent);
}
