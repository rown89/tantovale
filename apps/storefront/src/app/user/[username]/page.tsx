import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { format } from 'date-fns';
import { User } from 'lucide-react';

import { Avatar, AvatarFallback } from '@workspace/ui/components/avatar';
import { Separator } from '@workspace/ui/components/separator';
import { client } from '@workspace/server/client-rpc';
import { ItemDetailCard } from '@workspace/ui/components/item-detail-card/index';
import { linkBuilder } from '@workspace/shared/utils/linkBuilder';

// User profile component that fetches and displays user data
async function UserProfile({ username }: { username: string }) {
	const profileDataResponse = await client.profile.compact[':username'].$get({
		param: {
			username,
		},
	});

	if (!profileDataResponse.ok) return notFound();

	const profileData = await profileDataResponse.json();

	return (
		<div className='flex flex-row items-center gap-6'>
			<Avatar className='h-24 w-24'>
				<AvatarFallback>{username.substring(0, 2).toUpperCase()}</AvatarFallback>
			</Avatar>

			<div className='space-y-2'>
				<h1 className='text-3xl font-bold'>{username}</h1>
				<div className='text-muted-foreground flex items-center gap-2'>
					<User className='h-4 w-4' />
					<span>Member since {format(profileData.created_at, 'MMM d, yyyy')}</span>
				</div>
			</div>
		</div>
	);
}

// User items component that fetches and displays the user's items
async function UserItems({ username }: { username: string }) {
	const useItemsResponse = await client.items[':username'].$get({
		param: {
			username,
		},
	});

	if (!useItemsResponse.ok) return notFound();

	const items = await useItemsResponse.json();

	return (
		<div className='grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3'>
			{items.length === 0 ? (
				<div className='col-span-full py-12 text-center'>
					<h3 className='text-muted-foreground text-xl font-medium'>No items published yet</h3>
					<p className='text-muted-foreground mt-2'>This user hasn&apos;t published any items for sale.</p>
				</div>
			) : (
				items.map((item) => {
					return (
						<Link
							href={`/item/${linkBuilder({
								id: item.id,
								title: item.title,
							})}`}
							key={item.id}
							className='hover:shadow-accent/20 group overflow-hidden rounded-xl transition-all hover:shadow-md'>
							<ItemDetailCard
								item={{
									id: item.id,
									title: item.title,
									price: item.price,
									images: [
										<Image
											key={item.imageUrl}
											src={item.imageUrl || '/placeholder.svg'}
											alt={item.title}
											fill
											className='object-cover'
										/>,
									],
									subcategory: <div>{item.subcategory}</div>,
									location: item.location,
								}}
							/>
						</Link>
					);
				})
			)}
		</div>
	);
}

export default async function UserDetailPage({ params }: { params: Promise<{ username: string }> }) {
	const { username } = await params;

	return (
		<div className='container mx-auto px-4 py-8'>
			<div className='grid gap-8'>
				<UserProfile username={username} />
				<Separator />
				<UserItems username={username} />
			</div>
		</div>
	);
}
