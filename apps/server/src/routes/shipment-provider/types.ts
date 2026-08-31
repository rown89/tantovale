export interface ShipmentCalculationData {
	itemData: {
		item_id: number;
		item_profile_id: number;
		item_address_id: number;
		item_status: string;
		item_published: boolean;
		item_easy_pay: boolean;
		item_subcategory_id: number;
		category_id: number;
		seller_profile_id: number;
		seller_name: string;
		seller_surname: string;
		seller_email: string;
		seller_street_address: string;
		seller_address_id: number;
		seller_city_id: number;
		seller_province_id: number;
		seller_civic_number: string;
		seller_city_name: string;
		seller_province_name: string;
		seller_country_code: string;
		seller_postal_code: number;
		seller_phone: string;
		item_weight: number | null;
		item_length: number | null;
		item_width: number | null;
		item_height: number | null;
	};
	buyerProfile: {
		id: number;
		address_id: number;
		city_id: number;
		province_id: number;
		name: string;
		surname: string;
		street_address: string;
		civic_number: string;
		city_name: string;
		province_name: string;
		country_code: string;
		postal_code: number;
		phone: string;
	};
}
