import HandleItemFormComponent from '#components/forms/handle-item-form';
import { defaultValues } from '#components/forms/handle-item-form/constants';
import { reshapedSchemaType } from '#components/forms/handle-item-form/types';
import { client } from '@workspace/server/client-rpc';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function NewItemPage({
	searchParams,
}: {
	searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
	const cookieStore = await cookies();
	const accessToken = cookieStore.get('access_token')?.value;
	const refreshToken = cookieStore.get('refresh_token')?.value;

	const subcatId = (await searchParams).cat;

	const subCatIdNumber = Number(subcatId);

	const getProfileAddress = await client.addresses.auth.default_address.$get(
		{},
		{
			headers: {
				cookie: `access_token=${accessToken}; refresh_token=${refreshToken};`,
			},
		},
	);

	if (!getProfileAddress.ok) redirect('/');

	const address = await getProfileAddress.json();

	if (subcatId) {
		if (isNaN(subCatIdNumber)) redirect('/item/new');

		const response = await client.subcategories[':id'].$get({
			param: {
				id: subcatId.toString(),
			},
		});

		if (!response.ok) redirect('/item/new');

		const subcategory = await response.json();

		return (
			<HandleItemFormComponent
				formModel='create'
				subcategory={subcategory?.[0]}
				profileAddress={address}
				defaultValues={defaultValues as unknown as reshapedSchemaType}
			/>
		);
	}

	return (
		<HandleItemFormComponent
			formModel='create'
			profileAddress={address}
			defaultValues={defaultValues as unknown as reshapedSchemaType}
		/>
	);
}
