import { AuthTokens } from '#shared/auth-tokens';
import { OrderProposalStatus } from '@workspace/server/enumerated_values';
import { itemDetailResponseType } from '@workspace/server/extended_schemas';

export interface ItemDetailPageParams {
	id: string;
	authTokens: AuthTokens;
}

// Core data interfaces
interface Item extends itemDetailResponseType {}

interface ItemOwnerData {
	id: number;
	phone_verified: boolean;
	email_verified: boolean;
	selling_items: number;
	location: {
		city: {
			id: number;
			name: string;
		};
		province: {
			id: number;
			name: string;
		};
	};
}

interface OrderProposal {
	id: number;
	created_at: string;
}

// Main data interface for the page
export interface ItemDetailData {
	item: Item;
	itemOwnerData: ItemOwnerData;
	chatId?: number;
	orderProposal?: OrderProposal;
	isFavorite: boolean;
	isCurrentUserTheItemOwner: boolean;
}

// Re-export existing types for backward compatibility
export interface ItemWrapperProps extends ItemDetailData {}

// Error handling types
export interface FetchError {
	message: string;
	status?: number;
	code?: string;
}

export interface AuthHeaders {
	cookie: string;
}
