import bcrypt from "bcrypt";
import { db } from "@tantovale/database/db";
import { users } from "@tantovale/database/schema";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { sign } from "hono/jwt";
import { setCookie } from "hono/cookie";

export const emailExist = async (email: string) => {
  const user = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  return user?.[0];
};

export const hashPassword = async (password: string): Promise<string> => {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
};

export const checkPassword = async (
  password: string,
  hash: string,
): Promise<boolean> => {
  return await bcrypt.compare(password, hash);
};

export function errorWithStatus(error: unknown, status: number): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status: unknown }).status === status
  );
}

/**
 * Generates a JWT token and sets it as an HTTP-only secure cookie.
 * @param c - Hono Context
 * @param email - User's email
 * @param secret - JWT secret key
 * @param expiresIn - Token expiration time in seconds (default: 1 hour)
 */
export const generateAndSetToken = async (
  c: Context,
  email: string,
  secret: string,
  expiresIn: number = 60 * 60, // 1 hour
) => {
  const payload = {
    email,
    exp: Math.floor(Date.now() / 1000) + expiresIn,
  };

  const token = await sign(payload, secret);

  setCookie(c, "token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 60 * 60 * 24, // 24 hours
  });

  return { token, payload };
};

/**
 * Deletes a cookie by setting its expiration to the past.
 * @param c - Hono Context
 * @param name - Name of the cookie to delete
 */
export const deleteCookie = (c: Context, name: string) => {
  setCookie(c, name, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 0, // Immediately expires the cookie
    expires: new Date(0), // Set to the past
  });
};
