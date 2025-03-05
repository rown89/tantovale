"use client";

import { useActionState } from "react";
import {
  AnyFieldApi,
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
  categoryId,
  subCategoryId,
}: {
  categoryId?: string | string[];
  subCategoryId?: string | string[];
}) {
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

  const {
    data: cat,
    isLoading: isLoadingCat,
    isError: isErrorCat,
  } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const res = await client.categories.$get();
      return await res.json();
    },
  });

  const {
    data: subCat,
    isLoading: isLoadingSubCat,
    isError: isErrorSubCat,
  } = useQuery({
    queryKey: ["subcategories"],
    queryFn: async () => {
      const res = await client.subcategories.$get();
      return await res.json();
    },
  });

  const title = useField({
    form,
    name: "commons.title",
  });

  const description = useField({
    form,
    name: "commons.description",
  });

  const price = useField({
    form,
    name: "commons.price",
  });

  return (
    <div className="container mx-auto py-6 px-4">
      <h1 className="text-2xl font-bold mb-6">Create New Item</h1>

      <div className="flex gap-6">
        {/* Left Column - Form */}
        <div className="md:w-md w-full">
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

            {!isErrorCat && Array.isArray(cat) && cat.length && (
              <form.Field name="commons.category_id">
                {(field) => {
                  return (
                    <div className="space-y-2">
                      <Select
                        onValueChange={(e) => field.handleChange(e)}
                        defaultValue={field.state.value}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a category" />
                        </SelectTrigger>

                        <SelectContent>
                          <SelectGroup>
                            <SelectLabel className="block">
                              Categoy <span className="text-red-500">*</span>
                            </SelectLabel>

                            {cat?.map((item, i) => (
                              <SelectItem key={i} value={item.id?.toString()}>
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
            )}

            {!isErrorSubCat && Array.isArray(subCat) && subCat.length && (
              <form.Field name="commons.subcategory_id">
                {(field) => {
                  return (
                    <div className="space-y-2">
                      <Select
                        onValueChange={(e) => field.handleChange(e)}
                        defaultValue={field.state.value}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a category" />
                        </SelectTrigger>

                        <SelectContent>
                          <SelectGroup>
                            <SelectLabel className="block">
                              Subcategory{" "}
                              <span className="text-red-500">*</span>
                            </SelectLabel>
                            {subCat?.map((item, i) => (
                              <SelectItem key={i} value={item.id?.toString()}>
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
            )}

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
                console.log("canSubmit", canSubmit);
                return (
                  <Button type="submit" disabled={!canSubmit || !isDirty}>
                    {isSubmitting ? "..." : "Submit"}
                  </Button>
                );
              }}
            </form.Subscribe>

            {JSON.stringify(form.state.errors)}
          </form>
        </div>

        {/* Right Column - Preview */}
        <div className="md:w-full md:inline-block hidden">
          <Card>
            <CardHeader>
              <CardTitle>Article Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <h2 className="text-2xl font-bold mb-2 break-all">
                {String(title.state.value) || "Item Title"}
              </h2>
              <p className="text-xl font-semibold mb-4">
                € {Number(price.state.value).toFixed(2) || "Item Title"}
              </p>
              <div className="text-gray-600 mb-4 whitespace-pre-wrap max-h-60 overflow-auto break-all">
                {String(description.state.value) ||
                  "Item description will appear here."}
              </div>
              <div className="bg-gray-100 p-4 rounded-md">
                <p className="text-sm text-gray-500">
                  This is a preview of how your article will appear to others.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
