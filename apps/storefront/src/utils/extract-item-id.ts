// Utility function to extract item ID from url pathname
export function extractItemId(pathname: string | null): string | null {
  if (!pathname) return null;
  const match = pathname.match(/\/item\/(?:[^/]+-)?(\d+)/);
  return match?.[1] ?? null;
}
