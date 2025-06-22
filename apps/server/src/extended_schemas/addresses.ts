import { addresses } from '@workspace/server/database';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod/v4';

export const addAddressSchema = createInsertSchema(addresses, {
	label: (schema) => schema.min(1, 'Label is required').max(50, 'Label must be less than 50 characters'),
	province_id: (schema) =>
		schema.min(1, 'Province is required').refine((val) => val !== 0, { message: 'Province is required' }),
	city_id: (schema) =>
		schema.min(1, 'City is required').refine((val) => val !== 0, { message: 'Province is required' }),
	street_address: (schema) =>
		schema
			.min(3, 'Street address must be at least 3 characters')
			.max(100, 'Street address must be less than 100 characters'),
	civic_number: (schema) =>
		schema.min(1, 'Civic number is required').max(10, 'Civic number must be less than 10 characters'),
	postal_code: (schema) =>
		schema.min(1, 'Postal code is required').refine((val) => val !== 0, { message: 'Postal code is required' }),
	country_code: (schema) => schema.min(1, 'Country code is required'),
	status: (schema) =>
		schema.refine((val) => val === 'active' || val === 'inactive', {
			message: 'Status must be either active or inactive',
		}),
})
	.omit({
		profile_id: true,
		updated_at: true,
		created_at: true,
	})
	.extend({
		address_id: z.number().optional(),
	});

export interface ExtendedAddress extends z.infer<typeof addAddressSchema> {
	id?: number;
	city_name: string;
	province_name: string;
	province_country_code: string;
	city_country_code: string;
}
