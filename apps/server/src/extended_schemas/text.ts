export function hasAtMostUnicodeCodePoints(value: Iterable<string>, maximum: number): boolean {
	let count = 0;
	for (const chunk of value) {
		for (const codePoint of chunk) {
			if (codePoint.length === 0) continue;
			count += 1;
			if (count > maximum) return false;
		}
	}
	return true;
}
