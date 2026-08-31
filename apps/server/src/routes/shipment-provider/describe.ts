import { DescribeRouteOptions } from 'hono-openapi';

export const activeCarriersDescription: DescribeRouteOptions = {
	description: 'Get a list of active shipping carriers',
	responses: {
		200: {
			description: 'A list of active carriers',
			content: {
				'application/json': {
					schema: {
						type: 'object',
						properties: {
							activeCarriers: {
								type: 'array',
								items: {
									type: 'object',
									properties: {
										accountId: { type: 'string' },
										active: { type: 'boolean' },
										carrier: { type: 'string' },
									},
									required: ['accountId', 'active', 'carrier'],
								},
							},
						},
						required: ['activeCarriers'],
					},
				},
			},
		},
	},
};

export const createLabelDescription: DescribeRouteOptions = {
	description: 'Purchase a shipping label from a verified rate belonging to the order shipment',
	responses: {
		201: {
			description: 'Shipping label purchased',
			content: {
				'application/json': {
					schema: {
						type: 'object',
						properties: {
							label: {
								type: 'object',
								properties: {
									id: { type: 'string' },
									status: { type: 'string', enum: ['SUCCESS'] },
									label_url: { type: 'string', format: 'uri' },
									tracking_number: { type: 'string' },
									tracking_url: { type: 'string', format: 'uri' },
								},
								required: ['id', 'status', 'label_url'],
							},
						},
						required: ['label'],
					},
				},
			},
		},
	},
};
