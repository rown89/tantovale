import { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { ReadonlyURLSearchParams } from 'next/navigation';

export function handleQueryParamChange(
	qs: string,
	value: string,
	searchParams: ReadonlyURLSearchParams,
	router: AppRouterInstance,
) {
	const params = new URLSearchParams(searchParams);
	params.set(qs, value);
	const newUrl = `?${params.toString()}`;
	router.replace(newUrl);
}
