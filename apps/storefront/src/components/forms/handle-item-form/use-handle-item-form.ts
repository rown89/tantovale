import { useMemo, useState } from 'react';
import { AnyFieldApi, useForm } from '@tanstack/react-form';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import imageCompression from 'browser-image-compression';

import { client } from '@workspace/server/client-rpc';
import type { Category } from '@workspace/server/extended_schemas';

import useTantovaleStore from '#/stores';

import { handleQueryParamChange } from '../../../utils/handle-qp';
import { PropertyType, reshapedSchemaType } from './types';
import { reshapedCreateItemSchema } from './reshaped-create-item-schema';
import { updatePropertiesArray } from './utils';

export interface UseItemFormProps {
	subcategory?: Partial<Category>;
	subCatProperties: PropertyType[] | undefined;
	defaultValues: reshapedSchemaType;
}

export function useHandleItemForm({ subcategory, subCatProperties, defaultValues }: UseItemFormProps) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const { isManualShipping, isPickup, easyPay, setIsManualShipping, setIsPickup, setEasyPay } = useTantovaleStore();

	const [selectedSubCategory, setSelectedSubCategory] = useState<Partial<Category> | undefined>(subcategory);
	const [isSubmittingForm, setIsSubmittingForm] = useState(false);

	const deliveryMethodProperty = useMemo(() => {
		return subCatProperties?.find((item) => item.slug === 'delivery_method');
	}, [subCatProperties]);

	const form = useForm({
		defaultValues,
		asyncAlways: true,
		validators: {
			onChange: reshapedCreateItemSchema({
				propertiesData: subCatProperties ?? [],
			}),
		},
		onSubmit: async ({ value }: { value: reshapedSchemaType }) => {
			setIsSubmittingForm(true);

			try {
				const { images, ...rest } = value;

				const itemResponse = await client.item.auth.new.$post({
					json: rest,
				});

				if (itemResponse.status !== 201) {
					throw new Error('Failed to add new item');
				}

				const newItem = await itemResponse.json();

				// Compress images before uploading
				if (images.length > 0) {
					const compressionOptions = {
						maxSizeMB: 2, // Max file size in MB
						maxWidthOrHeight: 2000, // Maintain reasonable dimensions
						useWebWorker: true, // Use web workers for better performance
						preserveExif: true, // Preserve image metadata
					};

					const compressedImages = await Promise.all(
						images.map(async (image) => {
							try {
								// @ts-ignore
								return await imageCompression(image, compressionOptions);
							} catch (error) {
								console.error('Error compressing image:', error);
								return image; // Fall back to original if compression fails
							}
						}),
					);

					const imagesResponse = await client.uploads.auth['images-item'].$post({
						form: {
							images: compressedImages,
							item_id: String(newItem.item_id),
						},
					});

					if (!imagesResponse.ok) {
						throw new Error('Failed to upload images');
					}
				}

				toast(`Success!`, {
					description: 'Item added correctly!',
					duration: 4000,
				});

				router.push(`/item/${value.commons.title}-${newItem.item_id}`);
			} catch (error) {
				toast(`Error :(`, {
					description: `We are encountering technical problems, please retry later. \n ${error instanceof Error ? error.message : 'Unknown error'}`,
					duration: 4000,
				});
			} finally {
				setIsSubmittingForm(false);

				// reset the item new store
				useTantovaleStore.setState({
					isManualShipping: false,
					isPickup: false,
				});
			}
		},
	});

	function removeDeliveryMethodProperty() {
		const properties = form.getFieldValue('properties') || [];

		form.setFieldValue('properties', [
			...properties.filter(
				(property) => property.id !== deliveryMethodProperty?.id && property.slug !== deliveryMethodProperty?.slug,
			),
		]);

		return properties;
	}

	function handlePropertiesReset() {
		form.setFieldValue('properties', []);
	}

	function handleShippingReset() {
		form.setFieldValue('shipping.manual_shipping_price', 0);
		form.setFieldValue('shipping.item_weight', 0);
		form.setFieldValue('shipping.item_length', 0);
		form.setFieldValue('shipping.item_width', 0);
		form.setFieldValue('shipping.item_height', 0);
	}

	function handleSubCategorySelect(subcategory?: Partial<Category>) {
		if (!subcategory) return;

		setSelectedSubCategory(subcategory);
		const field = form.getFieldValue('commons.subcategory_id');

		if (subcategory?.id && field && typeof field === 'object' && 'setValue' in field) {
			(field as { setValue: (value: number) => void }).setValue(subcategory.id);
		}

		handleQueryParamChange('cat', subcategory?.id?.toString() ?? '', searchParams, router);
	}

	function handleEasyPayChange(checked: boolean, field: AnyFieldApi, propertiesField: AnyFieldApi) {
		// Update the Easy Pay form field value
		field.handleChange(checked);

		// Handle shipping and delivery method properties
		if (checked) {
			// When enabling Easy Pay, reset shipping price and disable manual shipping

			form.setFieldValue('shipping.manual_shipping_price', 0);
			setIsManualShipping(false);

			// Disable pickup
			if (isPickup) setIsPickup(false);

			// Only update delivery methods if the property exists
			if (deliveryMethodProperty?.id) {
				const deliveryValue = deliveryMethodProperty.options.find((option) => option.value === 'shipping_easy_pay')?.id;

				if (!deliveryValue) return;

				// Add the shipping_prepaid delivery method required for Easy Pay
				updatePropertiesArray({
					value: deliveryValue,
					property: deliveryMethodProperty,
					field: propertiesField,
				});
			}
		} else {
			removeDeliveryMethodProperty();
		}
	}

	function handleManualShippingChange(value: boolean, propertiesField: AnyFieldApi) {
		// Disable Easy Pay box UI
		form.setFieldValue('commons.easy_pay', false);

		// Disable pickup box UI
		setIsPickup(false);

		// Enable manual shipping UI
		setIsManualShipping(value);

		// reset shipping dimensions and price
		handleShippingReset();

		// if "delivery_method" property exists and "manual shipping" is enabled
		if (deliveryMethodProperty?.id) {
			removeDeliveryMethodProperty();

			// Only update delivery methods if the property exists
			if (deliveryMethodProperty?.id) {
				const deliveryValue = deliveryMethodProperty.options.find((option) => option.value === 'shipping')?.id;

				if (!deliveryValue) return;

				// Add "shipping" to the properties array, use the field of properties to update the array
				updatePropertiesArray({
					value: deliveryValue,
					property: deliveryMethodProperty,
					field: propertiesField,
				});
			}
		}
	}

	function handlePickupChange(value: boolean, field: AnyFieldApi) {
		setIsPickup(value);
		// Disable manual shipping UI
		setIsManualShipping(false);
		// Disable Easy Pay box UI
		form.setFieldValue('commons.easy_pay', false);

		// Reset shipping dimensions and price
		handleShippingReset();

		if (value) {
			// Only update delivery methods if the property exists
			if (deliveryMethodProperty?.id) {
				const deliveryValue = deliveryMethodProperty.options.find((option) => option.value === 'pickup')?.id;

				if (!deliveryValue) return;

				// Add "shipping" to the properties array, use the field of properties to update the array
				updatePropertiesArray({
					value: deliveryValue,
					property: deliveryMethodProperty,
					field,
				});
			}
		} else {
			// remove "pickup" from the properties array
			removeDeliveryMethodProperty();
		}
	}

	return {
		form,
		isSubmittingForm,
		selectedSubCategory,
		isPickup,
		isManualShipping,
		deliveryMethodProperty,
		setIsManualShipping,
		setEasyPay,
		setIsPickup,
		handleSubCategorySelect,
		handlePropertiesReset,
		handlePickupChange,
		handleEasyPayChange,
		handleManualShippingChange,
		removeDeliveryMethodProperty,
	};
}
