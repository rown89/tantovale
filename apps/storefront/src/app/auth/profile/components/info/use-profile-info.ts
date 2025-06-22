import { useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { z } from 'zod/v4';
import { toast } from 'sonner';

import { UserProfileSchema } from '@workspace/server/extended_schemas';
import { client } from '@workspace/server/client-rpc';

const schema = UserProfileSchema.pick({
	name: true,
	surname: true,
	gender: true,
});

type schemaType = z.infer<typeof schema>;

export function useProfileInfoForm(profiles: schemaType) {
	const { name, surname, gender } = profiles;

	const defaultValues = {
		name,
		surname,
		gender,
	};

	const [isSubmittingProfileForm, setIsSubmittingProfileForm] = useState(false);

	// Initialize form
	const profileForm = useForm({
		defaultValues,
		validators: {
			onSubmit: schema,
		},
		onSubmit: async ({ value }: { value: schemaType }) => {
			setIsSubmittingProfileForm(true);

			try {
				const response = await client.profile.auth.$put({ json: value });

				if (!response.ok) {
					throw new Error('update profile error');
				}

				return toast(`Success!`, {
					description: 'Profile edited correctly!',
					duration: 4000,
				});
			} catch (error) {
				toast(`Error :(`, {
					description: `We are encountering technical problems, please retry later. \n ${error}`,
					duration: 4000,
				});
			} finally {
				setIsSubmittingProfileForm(false);
			}
		},
	});

	return {
		profileForm,
		isSubmittingProfileForm,
	};
}
