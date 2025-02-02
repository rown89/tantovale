import { pgEnum } from 'drizzle-orm/pg-core';

export const conditionEnum = pgEnum('condition', ['new', 'used', 'damaged']);
export const statusEnum = pgEnum('status', ['available', 'sold']);
export const deliveryMethodEnum = pgEnum('delivery_method', ['shipping', 'pickup']);
export const sexEnum = pgEnum('sex', ['male', 'female']);
