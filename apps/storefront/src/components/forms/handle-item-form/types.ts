import { z } from 'zod/v4';
import { reshapedCreateItemSchema } from './reshaped-create-item-schema';
import { Category, ExtendedAddress } from '@workspace/server/extended_schemas';

export type HandleItemFormComponent = {
	subcategory?: Pick<Category, 'id' | 'name' | 'slug' | 'easy_pay' | 'menu_order'>;
	formModel: 'create' | 'edit';
	profileAddress: Omit<ExtendedAddress, 'status' | 'phone'>;
	defaultValues: reshapedSchemaType;
};

export interface PropertyType {
	id: number;
	name: string;
	on_item_create_required: boolean;
	options: {
		id: number;
		name: string;
		value: string | number | boolean | string[] | number[] | boolean[] | null;
	}[];
	slug: string;
	type: string;
}

export type PropertyFormValue = Pick<PropertyType, 'id' | 'slug' | 'name'> & {
	value: PropertyType['options'][number]['value'];
};

export type reshapedSchemaType = z.infer<ReturnType<typeof reshapedCreateItemSchema>>;
