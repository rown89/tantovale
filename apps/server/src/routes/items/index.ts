import { createRouter } from "#lib/create-app";
import { createClient } from "@workspace/database/db";
import { items } from "@workspace/database/schemas/items";
import { eq, and, isNull } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import { env } from "hono/adapter";
import { itemsImages } from "@workspace/database/schemas/items_images";
import { verify } from "hono/jwt";
import { authMiddleware } from "#middlewares/auth";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

export const itemTypeSchema = z.object({
  published: z.boolean(),
});

export const itemsRoute = createRouter().post(
  "/user_selling_items",
  zValidator("json", itemTypeSchema),
  authMiddleware,
  async (c) => {
    const { ACCESS_TOKEN_SECRET } = env<{
      ACCESS_TOKEN_SECRET: string;
    }>(c);

    const params = await c.req.json();

    const accessToken = getCookie(c, "access_token");
    let payload = await verify(accessToken!, ACCESS_TOKEN_SECRET);
    const user_id = Number(payload.id);

    if (!user_id) return c.json({ message: "Invalid user id" }, 401);

    const { db } = createClient();

    try {
      const profileItems = await db
        .select({
          id: items.id,
          title: items.title,
          price: items.price,
          created_at: items.created_at,
          published: items.published,
          image: itemsImages.url,
        })
        .from(items)
        .innerJoin(itemsImages, eq(itemsImages.item_id, items.id))
        .where(
          and(
            isNull(items.deleted_at),
            eq(items.published, params.published),
            eq(items.status, "available"),
            eq(items.user_id, user_id),
            eq(itemsImages.size, "thumbnail"),
            eq(itemsImages.order_position, 0),
          ),
        )
        .orderBy(items.id);

      return c.json(profileItems, 200);
    } catch (error) {
      console.log(error);

      return c.json(
        {
          message: "Error, cant retrieve profile items",
        },
        500,
      );
    }
  },
);
