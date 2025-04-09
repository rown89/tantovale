import { client } from "@workspace/server/client-rpc";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import ItemWrapper from "./components/wrapper";

export default async function ItemSlugPage() {
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

  return <ItemWrapper item={item} />;
}
