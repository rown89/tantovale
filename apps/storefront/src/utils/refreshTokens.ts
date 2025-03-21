import { client } from "#lib/api";

export default async function refreshTokens() {
  const refreshedRequest = await client.auth.refresh.$post({
    credentials: "include",
  });

  if (!refreshedRequest.ok) {
    return false;
  } else {
    return true;
  }
}
