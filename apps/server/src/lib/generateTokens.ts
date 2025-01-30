import { sign } from "hono/jwt";
import { setSignedCookie } from "hono/cookie";
import type { Context } from "hono";

/**
 * Generates a JWT token and sets it as an HTTP-only secure cookie.
 * @param c - Hono Context
 * @param email - User's email
 * @param secret - JWT secret key
 * @param expiresIn - Token expiration time in seconds (default: 1 hour)
 */
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

export const generateAndSetTokens = async ({
  c,
  id,
  email,
  token_secret,
  refresh_token_secret,
  cookie_secret,
  hostname,
  expiresIn = 60 * 60, // Default to 1 hour
}: TokenOptions) => {
  const now = Math.floor(Date.now() / 1000);
  const MAX_COOKIE_AGE = 34560000;

  // Define token payloads
  const accessTokenPayload = {
    id,
    email,
    tokenOrigin: "/auth/login",
    exp: now + expiresIn,
  };
  const refreshTokenPayload = {
    id,
    email,
    tokenOrigin: "/auth/login",
    exp: now + Math.min(7 * 24 * 60 * 60, MAX_COOKIE_AGE),
  }; // Max 400 days

  // Generate tokens
  const token = await sign(accessTokenPayload, token_secret);
  const refreshToken = await sign(refreshTokenPayload, refresh_token_secret);

  // Common cookie options
  const isProduction = process.env.NODE_ENV === "production";

  // Set cookies
  await setSignedCookie(c, "auth_token", token, cookie_secret, {
    path: "/",
    secure: isProduction,
    domain: isProduction ? hostname : "localhost",
    httpOnly: true,
    sameSite: "Strict",
    maxAge: Math.min(expiresIn * 1000, MAX_COOKIE_AGE * 1000), // Align with access token expiry
    expires: new Date(
      Date.now() + Math.min(expiresIn * 1000, MAX_COOKIE_AGE * 1000),
    ),
  });

  await setSignedCookie(c, "refresh_token", refreshToken, cookie_secret, {
    path: "/",
    secure: isProduction,
    domain: isProduction ? hostname : "localhost",
    httpOnly: true,
    sameSite: "Strict",
    maxAge: Math.min(expiresIn * 1000, MAX_COOKIE_AGE * 1000), // Align with access token expiry
    expires: new Date(
      Date.now() + Math.min(expiresIn * 1000, MAX_COOKIE_AGE * 1000),
    ),
  });

  return { token, refreshToken, accessTokenPayload, refreshTokenPayload };
};
