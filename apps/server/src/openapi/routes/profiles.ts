import type { DescribeRouteOptions } from 'hono-openapi';
import { nullablePositiveIntegerSchema, positiveIntegerSchema, routeDescription, type ManualSchema } from '../common';

const profileSchema: ManualSchema = {
	type: 'object',
	properties: {
		id: positiveIntegerSchema,
		username: { type: 'string' },
		email: { type: 'string', format: 'email' },
		name: { type: 'string', minLength: 3, maxLength: 30 },
		surname: { type: 'string', minLength: 3, maxLength: 30 },
		gender: { type: 'string', enum: ['male', 'female'] },
		location: { type: 'object', additionalProperties: true },
		created_at: { type: 'string', format: 'date-time' },
	},
	required: ['name', 'surname', 'gender'],
	additionalProperties: true,
};

const compactLocationMember: ManualSchema = {
	type: 'object',
	properties: { id: positiveIntegerSchema, name: { type: 'string' } },
	required: ['id', 'name'],
	additionalProperties: false,
};

const compactProfileSchema: ManualSchema = {
	type: 'object',
	properties: {
		id: positiveIntegerSchema,
		profile_id: positiveIntegerSchema,
		phone_verified: { type: 'boolean' },
		email_verified: { type: 'boolean' },
		created_at: { type: 'string', format: 'date-time' },
		selling_items: { type: 'integer', minimum: 0 },
		location: {
			type: 'object',
			properties: { city: compactLocationMember, province: compactLocationMember },
			required: ['city', 'province'],
			additionalProperties: false,
		},
	},
	required: ['id', 'profile_id', 'phone_verified', 'email_verified', 'created_at', 'selling_items', 'location'],
	additionalProperties: false,
};

export const profilesOpenApi = {
	detail: routeDescription({
		method: 'GET',
		path: '/profile/auth',
		summary: 'Get the authenticated profile',
		tag: 'Profiles',
		security: 'access-refresh-cookie',
		errors: [401, 404, 500],
		responseSchema: profileSchema,
	}),
	activeAddress: routeDescription({
		method: 'GET',
		path: '/profile/auth/profile_active_address_id',
		summary: 'Get the active address ID',
		tag: 'Profiles',
		security: 'access-refresh-cookie',
		errors: [401, 500],
		responseSchema: nullablePositiveIntegerSchema,
	}),
	compact: routeDescription({
		method: 'GET',
		path: '/profile/compact/:username',
		summary: 'Get a compact public profile',
		tag: 'Profiles',
		security: 'public',
		errors: [404, 500],
		responseSchema: compactProfileSchema,
	}),
	update: routeDescription({
		method: 'PUT',
		path: '/profile/auth',
		summary: 'Update the authenticated profile',
		tag: 'Profiles',
		security: 'access-refresh-cookie',
		errors: [400, 401, 404, 500],
		requestSchema: {
			type: 'object',
			properties: {
				name: { type: 'string', minLength: 3, maxLength: 30 },
				surname: { type: 'string', minLength: 3, maxLength: 30 },
				gender: { type: 'string', enum: ['male', 'female'] },
			},
			required: ['name', 'surname', 'gender'],
			additionalProperties: false,
		},
		responseSchema: profileSchema,
	}),
} satisfies Record<string, DescribeRouteOptions>;
