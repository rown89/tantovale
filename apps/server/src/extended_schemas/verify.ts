import * as z from 'zod/v4';

export const EmailVerifySchema = z.object({
	email: z.email().nonempty(),
});

export const createEmailVerifySchema = EmailVerifySchema;
