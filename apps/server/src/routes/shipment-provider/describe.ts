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
							carriers: {
								type: 'array',
								items: {
									type: 'object',
									properties: {},
								},
							},
						},
						required: ['carriers'],
					},
				},
			},
		},
	},
};

export const createLabelDescription: DescribeRouteOptions = {
	description: 'Create a shipping label and return available rates',
	responses: {
		200: {
			description: 'Shipping label created and rates returned',
			content: {
				'application/json': {
					schema: {
						type: 'object',
						properties: {
							rates: {
								type: 'array',
								items: {
									type: 'object',
									properties: {},
								},
							},
						},
						required: ['rates'],
					},
				},
			},
		},
	},
};
