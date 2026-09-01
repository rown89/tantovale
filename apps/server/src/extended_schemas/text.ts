export function hasAtMostUnicodeCodePoints(value: string, maximum: number): boolean {
	return Array.from(value).length <= maximum;
}
