import { pgEnum } from 'drizzle-orm/pg-core';

import {
	chatMessageTypeValues,
	currencyValues,
	itemImagesSizeValues,
	itemStatusValues,
	orderProposalStatusValues,
	profileValues,
	sexValues,
	addressStatusValues,
	entityTrustapTransactionStatusValues,
} from './enumerated_values';

export const itemStatusEnum = pgEnum('status_enum', itemStatusValues);

export const ordersProposalStatusEnum = pgEnum('proposal_status_enum', orderProposalStatusValues);

export const chatMessageTypeEnum = pgEnum('chat_message_type_enum', chatMessageTypeValues);

export const currencyEnum = pgEnum('transaction_currency_enum', currencyValues);

export const sexEnum = pgEnum('sex_enum', sexValues);

export const profileEnum = pgEnum('profile_types_enum', profileValues);

export const itemImagesSizeEnum = pgEnum('item_images_size_enum', itemImagesSizeValues);

export const addressStatusEnum = pgEnum('address_status_enum', addressStatusValues);

export const entityTrustapTransactionTypeEnum = pgEnum(
	'entity_trustap_transaction_type_enum',
	entityTrustapTransactionStatusValues,
);
