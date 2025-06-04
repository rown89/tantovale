import { z } from 'zod';

export const UserProfileSchema = z.object({
	name: z.string().min(3).max(30).nonempty(),
	surname: z.string().min(3).max(30).nonempty(),
	username: z.string().min(3).max(30).nonempty(),
	email: z.string().email("L'email non sembra essere valida").nonempty(),
	gender: z.enum(['male', 'female']),
	password: z.string().min(8, 'La password deve contenere almeno 8 caratteri').max(100).nonempty(),
	privacy_policy: z.literal(true, {
		message: 'Devi accettare la privacy policy',
	}),
	marketing_policy: z.boolean(),
});
