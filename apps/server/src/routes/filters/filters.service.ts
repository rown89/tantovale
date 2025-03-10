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
    const { db } = createClient(c.env);

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
  const { db } = createClient(c.env);

  const filtersRequest = await db
    .select({
      filter_id: filters.id,
      filter_name: filters.name,
      filter_type: filters.type,
      filter_value_id: filterValues.id,
      filter_value_name: filterValues.name,
      filter_value_value: filterValues.value,
      filter_number_value: filterValues.numeric_value,
      filter_boolean_value: filterValues.boolean_value,
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
    options: Array<{
      id: FilterRow["filter_value_id"];
      name: FilterRow["filter_value_name"];
      value:
        | FilterRow["filter_value_value"]
        | FilterRow["filter_number_value"]
        | FilterRow["filter_boolean_value"];
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
        options: [],
      };
    }

    let value:
      | FilterRow["filter_value_value"]
      | FilterRow["filter_number_value"]
      | FilterRow["filter_boolean_value"] = row.filter_value_value;

    if (row.filter_boolean_value) value = row.filter_boolean_value;
    if (row.filter_number_value) value = row.filter_number_value;

    filtersLookup[row.filter_id]?.options.push({
      id: row.filter_value_id,
      name: row.filter_value_name,
      value,
    });
  }

  // Convert object to array of values
  const filtersWithValues: FilterWithValues[] = Object.values(filtersLookup);

  return filtersWithValues;
};
