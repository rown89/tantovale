export interface ItemWithProperties {
	id: number;
	title: string;
	price: number;
	subcategory: string;
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
	imageUrl: string | null;
	properties: Record<string, string[]>;
}
