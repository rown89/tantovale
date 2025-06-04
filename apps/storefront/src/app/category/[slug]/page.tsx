import { headers } from "next/headers";

export default async function ItemCategoryPage() {
  const headerList = await headers();
  const pathname = headerList.get("x-current-path");

  const categoryPathname = pathname?.split("/item/")?.[1];

  return <div>ItemCategoryPage</div>;
}
