import { selectProfilesSchema } from '#database/schemas/profiles';
import { selectUsersSchema } from '#database/schemas/users';
import { z } from 'zod/v4';

export const UserProfileSchema = selectProfilesSchema
	.pick({
		name: true,
		surname: true,
		gender: true,
		privacy_policy: true,
		marketing_policy: true,
	})
	.merge(
		selectUsersSchema.pick({
			username: true,
			email: true,
		}),
	)
	.extend({
		name: z.string().min(3).max(30).nonempty(),
		surname: z.string().min(3).max(30).nonempty(),
		gender: z.enum(['male', 'female']),
		privacy_policy: z.literal(true, {
			message: 'Devi accettare la privacy policy',
		}),
		marketing_policy: z.boolean(),
		username: z.string().min(3).max(30).nonempty(),
		email: z.email("L'email non sembra essere valida").nonempty(),
		password: z.string().min(8, 'La password deve contenere almeno 8 caratteri').max(100).nonempty(),
	});
