import "dotenv/config";

import { client } from "../lib/api";

export async function getItems() {
  if (!client?.items) {
    throw new Error("items is undefined");
  }

  // v1 is the baseurl of the router
  const res = await client?.items.$get();

  if (!res?.ok) {
    throw new Error("Something went wrong");
  }

  const data = res.json();
  console.log((await data).items);

  return data;
}
