import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { Spinner } from '@workspace/ui/components/spinner';

import ItemWDetailWrapper from './item-detail-wrapper';
import { getAuthTokens } from '#utils/get-auth-tokens';

import { fetchItemDetailData } from './utils/aggregated-fetch';
import { extractItemId } from '#utils/extract-item-id';

// Main page component
export default async function ItemDetailPage() {
	const headerList = await headers();
	const pathname = headerList.get('x-current-path');
	const id = extractItemId(pathname);

	if (!id || !Number(id)) {
		return notFound();
	}

	const authTokens = await getAuthTokens();

	try {
		const data = await fetchItemDetailData({ id, authTokens });

		return (
			<Suspense fallback={<Spinner />}>
				<ItemWDetailWrapper {...data} />
			</Suspense>
		);
	} catch (error) {
		console.error('Error loading item detail page:', error);
		return notFound();
	}
}
