import { Suspense } from 'react';

import { client } from '@workspace/server/client-rpc';
import { Skeleton } from '@workspace/ui/components/skeleton';

import UserInfoComponent from '../components/info';
import { getAuthTokens } from '#utils/get-auth-tokens';

export default async function UserInfoPage() {
	const { accessToken, refreshToken } = await getAuthTokens();

	const additionalOptions = {
		headers: {
			cookie: `access_token=${accessToken}; refresh_token=${refreshToken};`,
		},
	};

	const res = await client.profile.auth.$get({}, additionalOptions);

	if (!res.ok) return null;

	const profile = await res.json();

	if (!profile) return null;

	return (
		<div className='flex w-full flex-col gap-8 px-4'>
			<h1 className='text-3xl font-bold tracking-tight'>Profile</h1>
			<div className='mx-auto flex w-full flex-col'>
				<Suspense
					fallback={
						<div className='flex flex-col gap-10 opacity-50'>
							{[...Array(5).keys()].map((item, i) => (
								<div key={i} className='flex w-full flex-col gap-2'>
									<Skeleton className='bg-foreground h-2 w-[80]' />
									<Skeleton className='bg-foreground h-4 w-full' />
								</div>
							))}
						</div>
					}>
					<UserInfoComponent profile={profile} />
				</Suspense>
			</div>
		</div>
	);
}
