import { sign } from "hono/jwt";
import { setSignedCookie } from "hono/cookie";
import type { Context } from "hono";
import type { CookieOptions } from "hono/utils/cookie";

type TokenOptions = {
  c: Context;
  id: number;
  email: string;
  token_secret: string;
  refresh_token_secret: string;
  cookie_secret: string;
  hostname: string;
  expiresIn?: number;
};

export function generateToken({
  id,
  email,
  expiresIn = 60 * 60, // Default to 1 hour
}: Pick<TokenOptions, "id" | "email" | "expiresIn">) {
  const now = Math.floor(Date.now() / 1000);

  const tokenPayload = {
    id,
    email,
    tokenOrigin: "/auth/login",
    exp: now + expiresIn,
  };

  return tokenPayload;
}

export async function generateAndSetTokens({
  c,
  id,
  email,
  token_secret,
  refresh_token_secret,
  cookie_secret,
  hostname,
  expiresIn = 60 * 60, // Default to 1 hour
}: TokenOptions) {
  const isProduction = process.env.NODE_ENV === "production";

  const MAX_COOKIE_AGE = 30 * 24 * 60 * 60; // 30 days (2592000 seconds)

  const secure = isProduction;
  const domain = isProduction ? hostname : "localhost";
  // Refresh token should never last longer than MAX_COOKIE_AGE
  const maxAge = Math.min(expiresIn * 1000, MAX_COOKIE_AGE * 1000);
  // Cookie will expire based on maxAge
  const expires = new Date(Date.now() + maxAge);

  const accessTokenPayload = generateToken({
    id,
    email,
  });

  const refreshTokenPayload = generateToken({
    id,
    email,
  });

  // Generate tokens
  const token = await sign(accessTokenPayload, token_secret);
  const refreshToken = await sign(refreshTokenPayload, refresh_token_secret);

  const cookiesOptions: CookieOptions = {
    path: "/",
    secure,
    domain,
    httpOnly: true,
    sameSite: "strict",
    maxAge,
    expires,
  };

  await setSignedCookie(c, "auth_token", token, cookie_secret, {
    ...cookiesOptions,
  });
  await setSignedCookie(c, "refresh_token", refreshToken, cookie_secret, {
    ...cookiesOptions,
  });

  return { token, refreshToken, accessTokenPayload, refreshTokenPayload };
}
