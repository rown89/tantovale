import type { Context } from "hono";
import { eq } from "drizzle-orm";
import { createClient } from "#database/index";
import { filters } from "#database/schema/filters";
import { subCategoryFilters } from "#database/schema/subcategory_filters";

import type { AppBindings } from "#lib/types";
import { filterValues } from "#database/schema/filter_values";

export const getFilterByIdService = async (
  c: Context<AppBindings>,
  id: number,
) => {
  try {
    const { db } = createClient();

    const filtersList = await db
      .select()
      .from(filters)
      .where(eq(filters.id, Number(id)));

    if (!filtersList.length) return c.json({ message: "Missing filters" }, 500);

    return c.json(filtersList, 200);
  } catch (error) {
    return c.json({ message: "getFilterByIdService error" }, 500);
  }
};

export const getFiltersBySubcategoryFiltersIdService = async (
  c: Context<AppBindings>,
  id: number,
) => {
  const { db } = createClient();

  const filtersRequest = await db
    .select({
      filter_id: filters.id,
      filter_name: filters.name,
      filter_type: filters.type,
      filter_slug: filters.slug,
      // filter_values table
      fv_id: filterValues.id,
      fv_name: filterValues.name,
      fv_value: filterValues.value,
      fv_number_value: filterValues.numeric_value,
      fv_boolean_value: filterValues.boolean_value,
      // subcategory_filters table
      on_create_required: subCategoryFilters.on_item_create_required,
    })
    .from(subCategoryFilters)
    .innerJoin(filters, eq(subCategoryFilters.filter_id, filters.id))
    .innerJoin(filterValues, eq(filterValues.filter_id, filters.id))
    .where(eq(subCategoryFilters.subcategory_id, id));

  type FilterRow = (typeof filtersRequest)[number];

  type FilterWithValues = {
    id: FilterRow["filter_id"];
    name: FilterRow["filter_name"];
    type: FilterRow["filter_type"];
    slug: FilterRow["filter_slug"];
    on_create_required: FilterRow["on_create_required"];
    options: Array<{
      id: FilterRow["fv_id"];
      name: FilterRow["fv_name"];
      value:
        | FilterRow["fv_value"]
        | FilterRow["fv_number_value"]
        | FilterRow["fv_boolean_value"];
    }>;
  };

  const filtersLookup: Record<number, FilterWithValues> = {};

  // Process data in a single pass
  for (const row of filtersRequest) {
    if (!filtersLookup[row.filter_id]) {
      filtersLookup[row.filter_id] = {
        id: row.filter_id,
        name: row.filter_name,
        type: row.filter_type,
        slug: row.filter_slug,
        on_create_required: row.on_create_required,
        options: [],
      };
    }

    let value: FilterWithValues["options"][number]["value"] = row.fv_value;

    if (row.fv_boolean_value) value = row.fv_boolean_value;
    if (row.fv_number_value) value = row.fv_number_value;

    filtersLookup[row.filter_id]?.options.push({
      id: row.fv_id,
      name: row.fv_name,

      value,
    });
  }

  // Convert object to array of values
  const filtersWithValues: FilterWithValues[] = Object.values(filtersLookup);

  return filtersWithValues;
};
