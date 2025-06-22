import { Suspense } from 'react';

import { Spinner } from '@workspace/ui/components/spinner';

import ProfileSetupAddress from './';

export default async function ProfileSetupAddressPage() {
	return (
		<Suspense
			fallback={
				<div className='container mx-auto h-[calc(100vh-56px)] px-6 py-6 lg:px-2 xl:px-0'>
					<div className='flex h-full items-center justify-center'>
						<Spinner />
					</div>
				</div>
			}>
			<ProfileSetupAddress />
		</Suspense>
	);
}
