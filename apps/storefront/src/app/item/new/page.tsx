import CreateItemForm from "#components/forms/item-create-form";

export default async function CreateItemPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const catId = (await searchParams).cat;
  const subcatId = (await searchParams).subcat;

  return <CreateItemForm catId={catId} subcatId={subcatId} />;
}
