import type { DescribeRouteOptions } from 'hono-openapi';
import { messageSchema, positiveIntegerSchema, queryParameter, routeDescription, type ManualSchema } from '../common';

const passwordSchema: ManualSchema = {
	type: 'string',
	minLength: 8,
	maxLength: 100,
	description: 'Password, limited to 72 UTF-8 bytes by the runtime validator.',
};

const authUserSchema: ManualSchema = {
	type: 'object',
	properties: {
		id: positiveIntegerSchema,
		profile_id: positiveIntegerSchema,
		username: { type: 'string', minLength: 1 },
		email: { type: 'string', format: 'email' },
		email_verified: { type: 'boolean' },
		phone_verified: { type: 'boolean' },
		exp: { type: 'integer' },
	},
	required: ['id', 'profile_id', 'username', 'email', 'email_verified', 'phone_verified'],
	additionalProperties: false,
};

const authenticatedResponse: ManualSchema = {
	type: 'object',
	properties: { message: { type: 'string' }, user: authUserSchema },
	required: ['message', 'user'],
	additionalProperties: false,
};

const loginRequest: ManualSchema = {
	type: 'object',
	properties: { email: { type: 'string', format: 'email' }, password: passwordSchema },
	required: ['email', 'password'],
	additionalProperties: false,
};

const signupRequest: ManualSchema = {
	type: 'object',
	properties: {
		name: { type: 'string', minLength: 3, maxLength: 30 },
		surname: { type: 'string', minLength: 3, maxLength: 30 },
		gender: { type: 'string', enum: ['male', 'female'] },
		privacy_policy: { type: 'boolean', enum: [true] },
		marketing_policy: { type: 'boolean' },
		username: { type: 'string', minLength: 3, maxLength: 30 },
		email: { type: 'string', format: 'email' },
		password: passwordSchema,
	},
	required: ['name', 'surname', 'gender', 'privacy_policy', 'marketing_policy', 'username', 'email', 'password'],
	additionalProperties: false,
};

const emailRequest: ManualSchema = {
	type: 'object',
	properties: { email: { type: 'string', format: 'email' } },
	required: ['email'],
	additionalProperties: false,
};

const resetRequest: ManualSchema = {
	type: 'object',
	properties: { token: { type: 'string', minLength: 1 }, newPassword: passwordSchema },
	required: ['token', 'newPassword'],
	additionalProperties: false,
};

export const authenticationOpenApi = {
	login: routeDescription({
		method: 'POST',
		path: '/login',
		summary: 'Log in',
		tag: 'Authentication',
		security: 'public',
		errors: [400, 401, 403, 500],
		requestSchema: loginRequest,
		responseSchema: authenticatedResponse,
	}),
	logout: routeDescription({
		method: 'POST',
		path: '/logout/auth',
		summary: 'Log out and revoke the refresh family',
		tag: 'Authentication',
		security: 'refresh-cookie',
		errors: [401, 500],
		responseSchema: messageSchema,
	}),
	forgotPassword: routeDescription({
		method: 'POST',
		path: '/password/forgot-password',
		summary: 'Request a password reset',
		tag: 'Authentication',
		security: 'public',
		errors: [400, 500],
		requestSchema: emailRequest,
		responseSchema: messageSchema,
	}),
	resetPassword: routeDescription({
		method: 'POST',
		path: '/password/auth/reset',
		summary: 'Reset a password',
		tag: 'Authentication',
		security: 'public',
		errors: [400, 500],
		requestSchema: resetRequest,
		responseSchema: messageSchema,
	}),
	verifyResetToken: routeDescription({
		method: 'GET',
		path: '/password/auth/reset-verify-token',
		summary: 'Verify a password reset token',
		tag: 'Authentication',
		security: 'public',
		errors: [400, 500],
		parameters: [queryParameter('token', 'Password reset token.')],
		responseSchema: {
			type: 'object',
			properties: { valid: { type: 'boolean', enum: [true] }, id: positiveIntegerSchema },
			required: ['valid', 'id'],
			additionalProperties: false,
		},
	}),
	refresh: routeDescription({
		method: 'POST',
		path: '/refresh/auth',
		summary: 'Rotate the refresh session',
		tag: 'Authentication',
		security: 'refresh-cookie',
		errors: [401, 500],
		responseSchema: messageSchema,
	}),
	signup: routeDescription({
		method: 'POST',
		path: '/signup',
		summary: 'Create an account',
		tag: 'Authentication',
		security: 'public',
		success: 201,
		errors: [400, 409, 422, 500],
		requestSchema: signupRequest,
		responseSchema: messageSchema,
	}),
	user: routeDescription({
		method: 'GET',
		path: '/user/auth',
		summary: 'Get the authenticated user',
		tag: 'Authentication',
		security: 'access-refresh-cookie',
		errors: [401, 500],
		responseSchema: authUserSchema,
	}),
	verify: routeDescription({
		method: 'GET',
		path: '/verify',
		summary: 'Verify the authenticated session',
		tag: 'Authentication',
		security: 'access-refresh-cookie',
		errors: [401, 500],
		responseSchema: authenticatedResponse,
	}),
	verifyEmail: routeDescription({
		method: 'GET',
		path: '/verify/email',
		summary: 'Verify an email address',
		tag: 'Authentication',
		security: 'public',
		errors: [400, 404, 500],
		parameters: [queryParameter('token', 'Signed email verification token.')],
		responseSchema: messageSchema,
	}),
} satisfies Record<string, DescribeRouteOptions>;
