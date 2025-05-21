import HandleItemFormComponent from "#components/forms/handle-item-form";
import { client } from "@workspace/server/client-rpc";
import { redirect } from "next/navigation";

export default async function NewItemPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const subcatId = (await searchParams).cat;

  const subCatIdNumber = Number(subcatId);

  if (subcatId) {
    if (isNaN(subCatIdNumber)) redirect("/item/new");

    const response = await client.subcategories[":id"].$get({
      param: {
        id: subcatId.toString(),
      },
    });

    if (response.status != 200) redirect("/item/new");

    const subcategory = await response.json();

    return <HandleItemFormComponent subcategory={subcategory?.[0]} />;
  }

  return <HandleItemFormComponent />;
}
