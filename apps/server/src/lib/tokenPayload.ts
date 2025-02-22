import { sign } from "hono/jwt";
import { setCookie, setSignedCookie } from "hono/cookie";
import type { Context } from "hono";
import { getAuthTokenOptions } from "./getAuthTokenOptions";
import {
  DEFAULT_ACCESS_TOKEN_EXPIRES_IN_MS,
  DEFAULT_REFRESH_TOKEN_EXPIRES_IN_MS,
} from "../utils/constants";

type TokenOptions = {
  c: Context;
  id: number;
  username: string;
  email_verified: boolean;
  phone_verified: boolean;
  expiresIn?: number;
};

export function tokenPayload({
  id,
  username,
  email_verified,
  phone_verified,
  exp,
}: Omit<TokenOptions, "c" | "expiresIn"> & {
  exp: number;
}) {
  const tokenPayload = {
    id,
    username,
    email_verified,
    phone_verified,
    exp,
  };

  return tokenPayload;
}

export async function setAuthTokens({
  c,
  id,
  username,
  email_verified,
  phone_verified,
}: TokenOptions) {
  const access_token_secret = process.env.ACCESS_TOKEN_SECRET!;
  const refresh_token_secret = process.env.REFRESH_TOKEN_SECRET!;
  // const cookie_secret = process.env.COOKIE_SECRET!;

  const access_token_payload = tokenPayload({
    id,
    username,
    email_verified,
    phone_verified,
    exp: DEFAULT_ACCESS_TOKEN_EXPIRES_IN_MS,
  });

  const refresh_token_payload = tokenPayload({
    id,
    username,
    email_verified,
    phone_verified,
    exp: DEFAULT_REFRESH_TOKEN_EXPIRES_IN_MS,
  });

  try {
    // Generate and sign tokens
    const access_token = await sign(access_token_payload, access_token_secret);
    const refresh_token = await sign(
      refresh_token_payload,
      refresh_token_secret,
    );
    /* 
      await setSignedCookie(c, "access_token", access_token, cookie_secret, {
        ...getAuthTokenOptions("access_token"),
      });

      await setSignedCookie(c, "refresh_token", refresh_token, cookie_secret, {
        ...getAuthTokenOptions("refresh_token"),
      });
    */
    setCookie(c, "access_token", access_token, {
      ...getAuthTokenOptions("access_token"),
    });

    setCookie(c, "refresh_token", refresh_token, {
      ...getAuthTokenOptions("refresh_token"),
    });

    return {
      access_token,
      refresh_token,
      access_token_payload,
      refresh_token_payload,
    };
  } catch (error) {
    console.error("setAuthTokens error: ", error);

    return {
      access_token: "",
      refresh_token: "",
      access_token_payload,
      refresh_token_payload,
    };
  }
}
