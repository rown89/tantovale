import { client } from "@workspace/server/client-rpc";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import ItemWDetailrapper from "./components/Item-detail-wrapper";

export default async function ItemDetailPage() {
  const headerList = await headers();
  const pathname = headerList.get("x-current-path");

  // Improved extraction of itemId using a regular expression
  const match = pathname?.match(/\/item\/(?:[^/]+-)?(\d+)/);
  const id = match ? match[1] : null;

  if (!id || !Number(id)) return notFound();

  const itemResponse = await client.item[":id"].$get({
    param: {
      id,
    },
  });

  if (!itemResponse.ok) return notFound();

  const item = await itemResponse.json();

  const ownerDataResponse = await client.profile.compact[":username"].$get({
    param: {
      username: item.username,
    },
  });

  if (!ownerDataResponse.ok) return notFound();

  const ownerData = await ownerDataResponse.json();

  return <ItemWDetailrapper item={item} ownerData={ownerData} />;
}
