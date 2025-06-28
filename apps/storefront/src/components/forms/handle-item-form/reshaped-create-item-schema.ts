import {
	createItemSchema,
	multipleImagesSchema,
	propertySchema,
	shippingSchema,
} from '@workspace/server/extended_schemas';

import { PropertyType } from './types';
import useTantovaleStore from '#/stores';

export const reshapedCreateItemSchema = ({ propertiesData }: { propertiesData?: PropertyType[] }) => {
	return createItemSchema
		.extend({
			images: multipleImagesSchema,
			properties: propertySchema,
			shipping: shippingSchema.check((val) => {
				// Get latest values from store
				const currentStore = useTantovaleStore.getState();
				const { isManualShipping, isPickup, easyPay } = currentStore;

				const doesntHaveDeliveryMethod = !propertiesData?.find((property) => property.slug === 'delivery_method');

				// if properties data doesnt not contain delivery_method property or it's not easy_pay, skip this check
				if (doesntHaveDeliveryMethod) {
					return;
				} else {
					// Manual Shipping
					if (isManualShipping && !isPickup && (!val.value.shipping_price || val.value.shipping_price <= 0)) {
						val.issues.push({
							code: 'custom',
							input: val.value,
							message: 'Shipping price must be greater than 0',
							path: ['shipping_price'],
						});
						return;
					}

					// Pickup
					if (isPickup && !isManualShipping && (val.value.shipping_price || val.value.shipping_price !== 0)) {
						val.issues.push({
							code: 'custom',
							input: val.value,
							message: 'Shipping price must be 0 when using pickup',
						});
					}

					// Shipping easyPay
					if (easyPay && !isManualShipping && !isPickup) {
						if (!val.value.item_weight) {
							val.issues.push({
								code: 'custom',
								input: val.value,
								message: 'This field is required',
								path: ['item_weight'],
							});
						}
						if (!val.value.item_length) {
							val.issues.push({
								code: 'custom',
								input: val.value,
								message: 'This field is required',
								path: ['item_length'],
							});
						}
						if (!val.value.item_width) {
							val.issues.push({
								code: 'custom',
								input: val.value,
								message: 'This field is required',
								path: ['item_width'],
							});
						}
						if (!val.value.item_height) {
							val.issues.push({
								code: 'custom',
								input: val.value,
								message: 'This field is required',
								path: ['item_height'],
							});
						}
					}
				}
			}),
		})
		.check((val) => {
			// Check if all required subcat properties are satisfied
			propertiesData?.forEach((property) => {
				if (
					property.on_item_create_required &&
					!val.value.properties?.find((p: { slug: string }) => p.slug === property.slug)?.value
				) {
					val.issues.push({
						code: 'custom',
						input: val.value,
						message: 'This field is required',
						path: ['properties', property.slug],
					});
				}
			});
		});
};
