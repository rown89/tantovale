import { client } from "@workspace/server/client-rpc";

export default async function refreshTokens() {
  const refreshedRequest = await client.refresh.auth.$post({
    credentials: "include",
  });

  if (!refreshedRequest.ok) {
    return false;
  } else {
    return true;
  }
}
