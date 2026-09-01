export function hasAtMostUnicodeCodePoints(value: Iterable<string>, maximum: number): boolean {
	let count = 0;
	for (const codePoint of value) {
		if (codePoint.length === 0) continue;
		count += 1;
		if (count > maximum) return false;
	}
	return true;
}
