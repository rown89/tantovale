export interface BaseSubcategorySeed {
  name: string;
  slug: string;
}

export interface ClothingGroupSeed {
  parent: BaseSubcategorySeed;
  children: BaseSubcategorySeed[];
}

export interface SubcategorySeeds {
  electronic: BaseSubcategorySeed[];
  clothing: ClothingGroupSeed[];
  kids: BaseSubcategorySeed[];
  collectables: BaseSubcategorySeed[];
}

export interface FilterSeed extends BaseSubcategorySeed {
  type: "select" | "boolean" | "text";
}
