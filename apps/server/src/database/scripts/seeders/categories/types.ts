export interface BaseSubcategorySeed {
	name: string;
	slug: string;
	easy_pay?: boolean;
	menu_order?: number;
}

export interface ParentGroupSeed {
	parent: BaseSubcategorySeed;
	children: BaseSubcategorySeed[];
}

export interface SubcategorySeeds {
	electronics: (BaseSubcategorySeed | ParentGroupSeed)[];
	clothings: (BaseSubcategorySeed | ParentGroupSeed)[];
	kids: (BaseSubcategorySeed | ParentGroupSeed)[];
	collectables: (BaseSubcategorySeed | ParentGroupSeed)[];
}

export interface PropertySeed extends BaseSubcategorySeed {
	type: 'select' | 'select_multi' | 'boolean' | 'checkbox' | 'radio';
}

export interface ChildSubcategory {
	category_id: number;
	name: string;
	slug: string;
	parent_id: number;
	menu_order: number;
	easy_pay: boolean;
}
