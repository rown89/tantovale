import { createClient } from "@workspace/database/db";
import { cities, profiles, users } from "@workspace/database/schemas/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createRouter } from "#lib/create-app";
import { zValidator } from "@hono/zod-validator";
import { UserSchema } from "#schema/users";

export const profileRoute = createRouter()
  .get("/", async (c) => {
    const user = c.var.user;

    const { db } = createClient();

    const [userProfileData] = await db
      .select({
        username: users.username,
        email: users.email,
        fullname: profiles.fullname,
        gender: profiles.gender,
        city: {
          id: cities.id,
          name: cities.name,
        },
      })
      .from(users)
      .innerJoin(profiles, eq(users.id, profiles.user_id))
      .innerJoin(cities, eq(cities.id, profiles.city))
      .where(eq(users.id, user.id))
      .limit(1);

    if (!userProfileData) {
      return c.json({ message: "Profile not found" }, 404);
    }

    return c.json(userProfileData, 200);
  })
  .put(
    "/",
    zValidator(
      "json",
      UserSchema.pick({
        fullname: true,
        gender: true,
        city: true,
      }),
    ),
    async (c) => {
      const user = c.var.user;
      const values = await c.req.valid("json");

      try {
        const { db } = createClient();

        const [updatedProfile] = await db
          .update(profiles)
          .set({
            ...values,
            updated_at: new Date(),
          })
          .where(eq(profiles.user_id, Number(user.id)))
          .returning();

        if (!updatedProfile) {
          return c.json({ message: "Profile not found" }, 404);
        }

        return c.json(updatedProfile, 200);
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
    },
  );
