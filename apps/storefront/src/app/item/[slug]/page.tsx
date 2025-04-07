import { ItemDetailCard } from "#components/item-card";
import { client } from "@workspace/shared/clients/rpc-client";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

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

  // Create a dummy ref object since we can't use useRef in a Server Component
  const dummyRef = { current: null };

  console.log(item);
  return (
    <div className="container mx-auto max-w-[800px]">
      <ItemDetailCard isPreview={false} imagesRef={dummyRef} {...item} />
    </div>
  );
}
