import { sign } from "hono/jwt";
import { setSignedCookie } from "hono/cookie";
import type { Context } from "hono";
import type { CookieOptions } from "hono/utils/cookie";
import { isProductionMode } from "./utils";

type TokenOptions = {
  c: Context;
  id: number;
  username: string;
  token_secret: string;
  refresh_token_secret: string;
  cookie_secret: string;
  hostname: string;
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
    tokenOrigin: "/auth/login",
    exp: now + expiresIn,
  };

  return tokenPayload;
}

export async function generateAndSetTokens({
  c,
  id,
  username,
  token_secret,
  refresh_token_secret,
  cookie_secret,
  hostname,
}: TokenOptions) {
  const accessTokenPayload = generateToken({
    id,
    username,
  });

  const refreshTokenPayload = generateToken({
    id,
    username,
  });

  // Generate tokens
  const token = await sign(accessTokenPayload, token_secret);
  const refreshToken = await sign(refreshTokenPayload, refresh_token_secret);

  await setSignedCookies({
    c,
    name: "auth_token",
    token,
    cookie_secret,
    hostname,
  });

  await setSignedCookies({
    c,
    name: "refresh_token",
    token: refreshToken,
    cookie_secret,
    hostname,
  });

  return { token, refreshToken, accessTokenPayload, refreshTokenPayload };
}

async function setSignedCookies({
  c,
  name,
  token,
  cookie_secret,
  hostname,
  expiresIn = 60 * 60, // Default to 1 hour
}: {
  c: Context;
  name: string;
  token: string;
  cookie_secret: string;
  hostname: string;
  expiresIn?: number;
}) {
  const MAX_COOKIE_AGE = 30 * 24 * 60 * 60; // 30 days (2592000 seconds)

  const secure = isProductionMode;
  const domain = isProductionMode ? hostname : "localhost";
  // Refresh token should never last longer than MAX_COOKIE_AGE
  const maxAge = Math.min(expiresIn * 1000, MAX_COOKIE_AGE * 1000);
  // Cookie will expire based on maxAge
  const expires = new Date(Date.now() + maxAge);

  const cookiesOptions: CookieOptions = {
    path: "/",
    secure,
    domain,
    httpOnly: true,
    sameSite: "strict",
    maxAge,
    expires,
  };

  await setSignedCookie(c, name, token, cookie_secret, {
    ...cookiesOptions,
  });
}
