export const securitySchemes = {
	accessCookie: { type: 'apiKey', in: 'cookie', name: 'access_token' },
	refreshCookie: { type: 'apiKey', in: 'cookie', name: 'refresh_token' },
	cronKey: { type: 'apiKey', in: 'query', name: 'key' },
	trustapWebhookBasic: { type: 'http', scheme: 'basic' },
} as const;
