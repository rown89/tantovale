import { z } from 'zod';

export const addressesSchema = z.object({
	street_address: z.string().min(6).max(100).nonempty(),
	city: z.number().refine((val) => val !== 0, {
		message: 'La città deve essere selezionata',
	}),
	province: z.number().refine((val) => val !== 0, {
		message: 'La provincia deve essere selezionata',
	}),
	postal_code: z
		.number()
		.min(5)
		.max(7)
		.refine((val) => val !== 0, {
			message: 'Il codice postale deve essere selezionato',
		}),
	country_code: z.string().min(2).max(2).nonempty().default('IT'),
});
