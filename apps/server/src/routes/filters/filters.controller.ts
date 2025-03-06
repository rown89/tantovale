import type { AppBindings } from "#lib/types";
import type { Context } from "hono";
import {
  getFilterByIdService,
  getFiltersBySubcategoryFiltersIdService,
} from "./filters.service";

export const getFilterByIdController = async (c: Context<AppBindings>) => {
  const id = Number(c.req.param("id"));

  if (isNaN(id)) return c.json({ message: "Invalid filter ID" }, 400);

  return getFilterByIdService(c, id);
};

export const getFiltersBySubcategoryFiltersId = async (
  c: Context<AppBindings>,
) => {
  const id = Number(c.req.param("id"));

  if (isNaN(id)) return c.json({ message: "Invalid filter ID" }, 400);

  return getFiltersBySubcategoryFiltersIdService(c, id);
};
