import CreateItemFormComponent from "#components/forms/item-create-form";
import { client } from "#lib/api";
import { redirect } from "next/navigation";

export default async function CreateItemPage({
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

    return <CreateItemFormComponent subcategory={subcategory?.[0]} />;
  }

  return <CreateItemFormComponent />;
}
