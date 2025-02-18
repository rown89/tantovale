import { sign } from "hono/jwt";
import { setSignedCookie } from "hono/cookie";
import type { Context } from "hono";
import { getTokenOptions } from "./getTokenOptions";
import {
  DEFAULT_ACCESS_TOKEN_EXPIRES_IN_MS,
  DEFAULT_REFRESH_TOKEN_EXPIRES_IN_MS,
} from "./constants";

type TokenOptions = {
  c: Context;
  id: number;
  username: string;
  access_token_secret: string;
  refresh_token_secret: string;
  cookie_secret: string;
  expiresIn?: number;
};

export function generateToken({
  id,
  username,
  exp,
}: Pick<TokenOptions, "id" | "username"> & { exp: number }) {
  const tokenPayload = {
    id,
    username,
    exp,
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
}: TokenOptions) {
  const access_token_payload = generateToken({
    id,
    username,
    exp: DEFAULT_ACCESS_TOKEN_EXPIRES_IN_MS,
  });

  const refresh_token_payload = generateToken({
    id,
    username,
    exp: DEFAULT_REFRESH_TOKEN_EXPIRES_IN_MS,
  });

  // Generate and sign tokens
  const access_token = await sign(access_token_payload, access_token_secret);
  const refresh_token = await sign(refresh_token_payload, refresh_token_secret);

  await setSignedCookie(c, "access_token", access_token, cookie_secret, {
    ...getTokenOptions("access_token"),
  });

  await setSignedCookie(c, "refresh_token", refresh_token, cookie_secret, {
    ...getTokenOptions("refresh_token"),
  });

  return {
    access_token,
    refresh_token,
    access_token_payload,
    refresh_token_payload,
  };
}
