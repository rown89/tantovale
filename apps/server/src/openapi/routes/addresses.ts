import type { DescribeRouteOptions } from 'hono-openapi';
import { positiveIntegerSchema, routeDescription, type ManualSchema } from '../common';

const addressInputProperties = {
	label: { type: 'string', minLength: 1, maxLength: 50 },
	province_id: positiveIntegerSchema,
	city_id: positiveIntegerSchema,
	street_address: { type: 'string', minLength: 3, maxLength: 100 },
	civic_number: { type: 'string', minLength: 1, maxLength: 10 },
	postal_code: positiveIntegerSchema,
	country_code: { type: 'string', minLength: 1, maxLength: 50 },
	status: { type: 'string', enum: ['active', 'inactive'] },
	phone: { type: 'string' },
} satisfies Record<string, ManualSchema>;

const addressInputRequired = ['province_id', 'city_id', 'street_address', 'civic_number', 'postal_code', 'phone'];

const addressInput: ManualSchema = {
	type: 'object',
	properties: addressInputProperties,
	required: addressInputRequired,
	additionalProperties: false,
};

const addressResponse: ManualSchema = {
	type: 'object',
	properties: {
		id: positiveIntegerSchema,
		...addressInputProperties,
		city_name: { type: 'string' },
		province_name: { type: 'string' },
		province_country_code: { type: 'string' },
		city_country_code: { type: 'string' },
		created_at: { type: 'string', format: 'date-time' },
		updated_at: { type: 'string', format: 'date-time' },
	},
	required: ['id'],
	additionalProperties: true,
};

const updateAddressInput: ManualSchema = {
	...addressInput,
	properties: { address_id: { type: 'number' }, ...addressInputProperties },
	required: ['address_id', ...addressInputRequired],
};

const addressIdInput: ManualSchema = {
	type: 'object',
	properties: { address_id: { type: 'number' } },
	required: ['address_id'],
	additionalProperties: false,
};

export const addressesOpenApi = {
	list: routeDescription({
		method: 'GET',
		path: '/addresses/auth/addresses_profile',
		summary: 'List profile addresses',
		tag: 'Addresses',
		security: 'access-refresh-cookie',
		errors: [401, 404, 500],
		responseSchema: { type: 'array', items: addressResponse },
	}),
	default: routeDescription({
		method: 'GET',
		path: '/addresses/auth/default_address',
		summary: 'Get the active profile address',
		tag: 'Addresses',
		security: 'access-refresh-cookie',
		errors: [401, 404, 500],
		responseSchema: addressResponse,
	}),
	add: routeDescription({
		method: 'POST',
		path: '/addresses/auth/add_address_to_profile',
		summary: 'Add a profile address',
		tag: 'Addresses',
		security: 'access-refresh-cookie',
		errors: [400, 401, 404, 500],
		requestSchema: addressInput,
		responseSchema: addressResponse,
	}),
	update: routeDescription({
		method: 'PUT',
		path: '/addresses/auth/update_address_to_profile',
		summary: 'Update a profile address',
		tag: 'Addresses',
		security: 'access-refresh-cookie',
		errors: [400, 401, 404, 500],
		requestSchema: updateAddressInput,
		responseSchema: addressResponse,
	}),
	hide: routeDescription({
		method: 'PUT',
		path: '/addresses/auth/hide_address_from_profile',
		summary: 'Hide a profile address',
		tag: 'Addresses',
		security: 'access-refresh-cookie',
		errors: [400, 401, 404, 500],
		requestSchema: addressIdInput,
		responseSchema: {
			type: 'object',
			properties: { id: positiveIntegerSchema },
			required: ['id'],
			additionalProperties: false,
		},
	}),
} satisfies Record<string, DescribeRouteOptions>;
