import CreateItemForm from "#components/forms/item-create-form";
import { redirect } from "next/navigation";

export default async function CreateItemPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const categoryId = (await searchParams).category;
  const subCategoryId = (await searchParams).subCategory;

  return <CreateItemForm subCategoryId={subCategoryId} />;
}
