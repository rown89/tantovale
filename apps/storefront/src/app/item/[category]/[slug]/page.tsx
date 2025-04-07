import { headers } from "next/headers";

export default async function ItemSlugPage() {
  const headerList = await headers();
  const pathname = headerList.get("x-current-path");

  const itemIdPathname = pathname?.split("/")?.[3];

  console.log(itemIdPathname);

  return <div>ItemSlugPage</div>;
}
