import { createRouter } from "#lib/create-app";
import { env } from "hono/adapter";
import { getCookie } from "hono/cookie";

export const userRoute = createRouter().get("/", async (c) => {
  const { ACCESS_TOKEN_SECRET } = env<{
    ACCESS_TOKEN_SECRET: string;
  }>(c);

  const user = c.var.user;

  if (user) {
    return c.json(user, 200);
  } else {
    return c.json(
      {
        message: "User not found",
      },
      404,
    );
  }
});
