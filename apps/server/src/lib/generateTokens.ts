import { sign } from "hono/jwt";
import { setSignedCookie } from "hono/cookie";
import type { Context } from "hono";
import { getTokenOptions } from "./getTokenOptions";

type TokenOptions = {
  c: Context;
  id: number;
  username: string;
  access_token_secret: string;
  refresh_token_secret: string;
  cookie_secret: string;
  domain: string;
  expiresIn?: number;
};

export function generateToken({
  id,
  username,
  expiresIn = 60 * 60, // Default to 1 hour
}: Pick<TokenOptions, "id" | "username" | "expiresIn">) {
  const now = Math.floor(Date.now() / 1000);

  const tokenPayload = {
    id,
    username,
    exp: now + expiresIn,
  };

  return tokenPayload;
}

export async function setAuthTokens({
  c,
  id,
  username,
  access_token_secret,
  refresh_token_secret,
  cookie_secret,
  domain,
}: TokenOptions) {
  const access_token_payload = generateToken({
    id,
    username,
  });

  const refresh_token_payload = generateToken({
    id,
    username,
  });

  // Generate and sign tokens
  const access_token = await sign(access_token_payload, access_token_secret);
  const refresh_token = await sign(refresh_token_payload, refresh_token_secret);

  const access_token_options = getTokenOptions("access_token", domain);
  await setSignedCookie(c, "access_token", access_token, cookie_secret, {
    ...access_token_options,
  });

  const refresh_token_options = getTokenOptions("refresh_token", domain);
  await setSignedCookie(c, "refresh_token", refresh_token, cookie_secret, {
    ...refresh_token_options,
  });

  return {
    access_token,
    refresh_token,
    access_token_payload,
    refresh_token_payload,
  };
}
