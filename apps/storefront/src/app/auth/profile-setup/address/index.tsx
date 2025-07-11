'use client';

import AddressForm from '#components/forms/address-form';
import { Label } from '@workspace/ui/components/label';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export default function ProfileSetupAddress() {
	const router = useRouter();

	return (
		<div className='container mx-auto h-[calc(100vh-73px)] px-6 lg:px-2 xl:px-0'>
			<div className='grid h-full grid-cols-1 gap-14 xl:grid-cols-2'>
				<div className='relative hidden h-full w-full xl:block'>
					<Image src='/heart-bg.png' alt='Address' fill className='object-cover' />
				</div>
				<div className='flex flex-col gap-4 py-6'>
					<h1 className='text-2xl font-bold'>Add Address</h1>
					<Label className='text-muted-foreground text-sm'>Add an address to your profile to start selling.</Label>
					<AddressForm
						firstAddress
						mode='add'
						onComplete={() => {
							toast.success('Success!', {
								description: 'Address correctly added!',
								duration: 8000,
							});
							router.push('/');
						}}
					/>
				</div>
			</div>
		</div>
	);
}
