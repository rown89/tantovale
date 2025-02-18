import { Hono, type Context } from "hono";
import { db } from "@workspace/database/db";
import { profiles } from "@workspace/database/schema";
import { eq } from "drizzle-orm";
import { updateProfileSchema } from "@/schema/profiles";
import { z } from "zod";

type UserBinding = {
  Variables: {
    user: {
      id: number;
      username: string;
    };
  };
};

export const profileRoute = new Hono<UserBinding>();

profileRoute.post("/", async (c) => {
  const user = c.var.user;

  const userProfile = await db
    .select()
    .from(profiles)
    .where(eq(profiles.user_id, user.id))
    .limit(1);

  if (!userProfile.length) {
    return c.json({ message: "Profile not found" }, 404);
  }

  return c.json(userProfile[0]);
});

profileRoute.put("/", async (c: Context) => {
  const user = c.var.user;
  const body = await c.req.json();

  try {
    const validatedData = updateProfileSchema.parse(body);

    const updatedProfile = await db
      .update(profiles)
      .set({
        ...validatedData,
        updated_at: new Date(),
      })
      .where(eq(profiles.user_id, Number(user.id)))
      .returning();

    if (!updatedProfile.length) {
      return c.json({ message: "Profile not found" }, 404);
    }

    return c.json(updatedProfile[0]);
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
