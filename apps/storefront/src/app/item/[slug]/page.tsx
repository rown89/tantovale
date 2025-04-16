import { client } from "@workspace/server/client-rpc";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import ItemWDetailrapper from "./components/item-detail-wrapper";

export default async function ItemDetailPage() {
  const headerList = await headers();
  const pathname = headerList.get("x-current-path");

  // Improved extraction of itemId using a regular expression
  const match = pathname?.match(/\/item\/(?:[^/]+-)?(\d+)/);
  const id = match ? match[1] : null;

  if (!id || !Number(id)) return notFound();

  // get item
  const itemResponse = await client.item[":id"].$get({
    param: {
      id,
    },
  });

  if (!itemResponse.ok) return notFound();

  const item = await itemResponse.json();

  // get profile compact data
  const itemOwnerDataResponse = await client.profile.compact[":username"].$get({
    param: {
      username: item.user.username,
    },
  });

  if (!itemOwnerDataResponse.ok) return notFound();

  const itemOwnerData = await itemOwnerDataResponse.json();

  return <ItemWDetailrapper item={item} itemOwnerData={itemOwnerData} />;
}
