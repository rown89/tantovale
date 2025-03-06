"use client";

import { useActionState, useEffect } from "react";
import {
  formOptions,
  mergeForm,
  useField,
  useForm,
  useTransform,
} from "@tanstack/react-form";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Textarea } from "@workspace/ui/components/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectGroup,
} from "@workspace/ui/components/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { createItemAction } from "#actions/item/create";
import { createItemSchema } from "../../../../server/src/routes/item/types";
import { initialFormState } from "@tanstack/react-form/nextjs";
import { client } from "#lib/api";
import { useQuery } from "@tanstack/react-query";
import { FieldInfo } from "./field-info";
import { useRouter, useSearchParams } from "next/navigation";

export const formOpts = formOptions({
  defaultValues: {
    commons: {
      title: "",
      description: "",
      condition: "used",
      price: 1,
      shipping_cost: 1,
      delivery_method: "pickup",
      subcategory_id: 1,
    },
    properties: [{ name: "condition", value: "new" }],
  },
});

export default function CreateItemForm({
  catId,
  subcatId,
}: {
  catId?: string | string[];
  subcatId?: string | string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, action, isPending] = useActionState(
    createItemAction,
    initialFormState,
  );

  const form = useForm({
    ...formOpts?.defaultValues,
    validators: {
      onChange: createItemSchema,
    },
    transform: useTransform(
      (baseForm) => mergeForm(baseForm, state ?? {}),
      [state],
    ),
  });

  const title = useField({ form, name: "commons.title" });
  const description = useField({ form, name: "commons.description" });
  const price = useField({ form, name: "commons.price" });
  const category_id = useField({ form, name: "commons.category_id" });
  const subcategory_id = useField({ form, name: "commons.subcategory_id" });

  const {
    data: cat,
    isLoading: isLoadingCat,
    isError: isErrorCat,
  } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const res = await client.categories.$get();

      if (!res.ok) return [];

      return await res.json();
    },
  });

  const {
    data: subCat,
    isLoading: isLoadingSubCat,
    isError: isErrorSubCat,
  } = useQuery({
    queryKey: ["subcategories", catId],
    queryFn: async () => {
      if (!catId) return [];

      const res = await client.subcategories[":id"].$get({
        param: {
          id: String(catId),
        },
      });

      if (!res.ok) {
        console.error("Failed to fetch subcategories");
        return [];
      }

      return await res.json();
    },
    enabled: !!catId,
  });

  const {
    data: subCatFilters,
    isLoading: isLoadingSubCatFilters,
    isError: isErrorSubCatFilters,
  } = useQuery({
    queryKey: ["subcategories_filters", subcatId],
    queryFn: async () => {
      if (!subcatId) return [];

      const res = await client.subcategory_fitlers[":id"].$get({
        param: {
          id: String(subcatId),
        },
      });

      if (!res.ok) {
        console.error("Failed to fetch subcategories filters");
        return [];
      }

      return await res.json();
    },
    enabled: !!subcatId,
  });

  const handleQueryParamChange = (qs: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    params.set(qs, value);
    const newUrl = `?${params.toString()}`;

    router.replace(newUrl);
  };

  useEffect(() => {
    if (catId) category_id.setValue(Number(catId));
    if (subcatId) subcategory_id.setValue(Number(subcatId));
  }, [catId, subcatId]);

  useEffect(() => {}, [isErrorCat, isErrorSubCat]);

  return (
    <div className="container mx-auto py-6 px-4">
      <h1 className="text-2xl font-bold mb-6">Create New Item</h1>

      <div className="flex gap-6">
        {/* Left Column - Form */}
        <div className="md:max-w-md w-full break-words">
          <form
            action={action as never}
            onSubmit={() => form.handleSubmit()}
            className="space-y-4 w-full"
          >
            <form.Field name="commons.title">
              {(field) => {
                return (
                  <div className="space-y-2">
                    <Label htmlFor={field.name} className="block">
                      Title <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value ?? ""}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={
                        field.state.meta.errors?.length ? "true" : "false"
                      }
                      className={
                        field.state.meta.errors?.length ? "border-red-500" : ""
                      }
                      placeholder="Enter a title"
                    />
                    <FieldInfo field={field} />
                  </div>
                );
              }}
            </form.Field>

            <form.Field name="commons.category_id">
              {(field) => {
                return (
                  <div className="space-y-2">
                    <Label className="block">
                      Category <span className="text-red-500">*</span>
                    </Label>
                    <Select
                      disabled={isLoadingCat || !cat}
                      onValueChange={(e) => {
                        field.handleChange(Number(e));
                        handleQueryParamChange("cat", e);
                      }}
                      defaultValue={
                        field.state.value?.toString() ?? catId?.toString() ?? ""
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>

                      <SelectContent>
                        <SelectGroup>
                          {!isErrorCat &&
                            cat?.map((item, i) => (
                              <SelectItem key={i} value={item.id.toString()}>
                                {item.name}
                              </SelectItem>
                            ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                );
              }}
            </form.Field>

            <form.Field name="commons.subcategory_id">
              {(field) => {
                return (
                  <div className="space-y-2">
                    <Label className="block">
                      Subcategory <span className="text-red-500">*</span>
                    </Label>
                    <Select
                      disabled={
                        isLoadingCat ||
                        isLoadingSubCat ||
                        !category_id.state.value
                      }
                      onValueChange={(e) => {
                        field.handleChange(Number(e));
                        handleQueryParamChange("subcat", e);
                      }}
                      defaultValue={
                        field.state.value?.toString() ??
                        subcatId?.toString() ??
                        ""
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a subcategory" />
                      </SelectTrigger>

                      <SelectContent>
                        <SelectGroup>
                          {!isErrorSubCat &&
                            subCat?.map((item, i) => (
                              <SelectItem key={i} value={item.id.toString()}>
                                {item.name}
                              </SelectItem>
                            ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                );
              }}
            </form.Field>

            <form.Field name="commons.price">
              {(field) => {
                return (
                  <div className="space-y-2">
                    <Label htmlFor={field.name} className="block">
                      Price <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="0.20"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) =>
                        field.handleChange(e.target.valueAsNumber)
                      }
                      className={
                        field.state.meta.errors?.length ? "border-red-500" : ""
                      }
                      aria-invalid={
                        field.state.meta.errors?.length ? "true" : "false"
                      }
                    />
                    <FieldInfo field={field} />
                  </div>
                );
              }}
            </form.Field>

            <form.Field name="commons.description">
              {(field) => {
                return (
                  <div className="space-y-2">
                    <Label htmlFor={field.name} className="block">
                      Description <span className="text-red-500">*</span>
                    </Label>
                    <Textarea
                      id={field.name}
                      name={field.name}
                      rows={4}
                      className={
                        field.state.meta.errors?.length ? "border-red-500" : ""
                      }
                      aria-invalid={
                        field.state.meta.errors?.length ? "true" : "false"
                      }
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="Enter a description for your item"
                    />
                    <FieldInfo field={field} />
                  </div>
                );
              }}
            </form.Field>

            <form.Subscribe
              selector={(formState) => [
                formState.canSubmit,
                formState.isSubmitting,
                formState.isDirty,
              ]}
            >
              {([canSubmit, isSubmitting, isDirty]) => {
                return (
                  <Button
                    type="submit"
                    disabled={!canSubmit || !isDirty || isPending}
                  >
                    {isSubmitting ? "..." : "Submit"}
                  </Button>
                );
              }}
            </form.Subscribe>

            <p>{JSON.stringify(form.state.errors, null, 2)}</p>
          </form>
        </div>

        {/* Right Column - Preview */}
        <div className="md:w-full md:inline-block hidden">
          <Card>
            <CardHeader>
              <CardTitle>Item Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <h2 className="text-2xl font-bold mb-2 break-all">
                {String(title.state.value ?? "") || "Title of the item"}
              </h2>
              <p className="text-xl font-semibold mb-4">
                € {Number(price.state.value ?? 0).toFixed(2) || "Item Title"}
              </p>
              <div className="text-gray-600 mb-4 whitespace-pre-wrap max-h-60 overflow-auto break-all">
                {String(description.state.value ?? "") ||
                  "Item description will appear here."}
              </div>
              <div className="bg-gray-100 p-4 rounded-md">
                <p className="text-sm text-gray-500">
                  This is a preview of how your item will appear to others.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
