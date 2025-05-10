export interface BaseSubcategorySeed {
	name: string;
	slug: string;
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

export interface FilterSeed extends BaseSubcategorySeed {
	type: 'select' | 'select_multi' | 'boolean' | 'checkbox' | 'radio';
}
