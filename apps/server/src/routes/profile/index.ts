import { createClient } from "@workspace/database/db";
import {
  items,
  itemsImages,
  profiles,
} from "@workspace/database/schemas/schema";
import { eq, and } from "drizzle-orm";
import { updateProfileSchema } from "#schema/profiles";
import { z } from "zod";
import { createRouter } from "#lib/create-app";
import { env } from "hono/adapter";
import { getCookie } from "hono/cookie";
import { verify } from "hono/jwt";

export const profileRoute = createRouter()
  .post("/", async (c) => {
    const user = c.var.user;

    const { db } = createClient();

    const userProfile = await db
      .select()
      .from(profiles)
      .where(eq(profiles.user_id, user.id))
      .limit(1);

    if (!userProfile.length) {
      return c.json({ message: "Profile not found" }, 404);
    }

    return c.json(userProfile[0]);
  })
  .put("/", async (c) => {
    const user = c.var.user;
    const body = await c.req.json();

    try {
      const validatedData = updateProfileSchema.parse(body);

      const { db } = createClient();
      const updatedProfile = await db
        .update(profiles)
        .set({
          ...validatedData,
          updated_at: new Date(),
        })
        .where(eq(profiles.user_id, Number(user.id)))
        .returning();

      const newProfile = updatedProfile?.[0];

      if (!newProfile) {
        return c.json({ message: "Profile not found" }, 404);
      }

      return c.json(newProfile);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json(
          {
            message: "Validation error",
            errors: error.errors,
          },
          400,
        );
      }

      console.error("Profile update error:", error);
      return c.json({ message: "Failed to update profile" }, 500);
    }
  });
