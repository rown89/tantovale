"use client";

import { useState, useEffect, startTransition } from "react";
import { useActionState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { createItemAction } from "#actions/item/create";
import type {
  ItemActionResponse,
  ItemFormData,
} from "#actions/item/create/types";
import { AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Textarea } from "@workspace/ui/components/textarea";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";

const initialState: ItemActionResponse = {
  success: false,
  message: "",
};

export default function CreateItemForm() {
  const [state, formAction] = useActionState(createItemAction, initialState);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ItemFormData>({
    defaultValues: {
      commons: {
        title: "",
        description: "",
        price: "0.00",
      },
      properties: [],
    },
  });

  const [isPending, setIsPending] = useState(false);

  const watchedFields = watch();

  useEffect(() => {
    if (state?.inputs) {
      Object.entries(state.inputs).forEach(([key, value]) => {
        if (key in watchedFields) {
          register(key as keyof ItemFormData, { value });
        }
      });
    }
  }, [state?.inputs, register, watchedFields]); // Added watchedFields to dependencies

  const onSubmit: SubmitHandler<ItemFormData> = async (data) => {
    setIsPending(true);
    try {
      const formData = new FormData();
      Object.entries(data).forEach(([key, value]) => {
        formData.append(key, value.toString());
      });

      startTransition(() => {
        formAction(formData);
      });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="container mx-auto py-6 px-4">
      <h1 className="text-2xl font-bold mb-6">Create New Item</h1>

      {state?.success && (
        <Alert className="mb-6 bg-green-50 border-green-200">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertTitle className="text-green-800">Success</AlertTitle>
          <AlertDescription className="text-green-700">
            {state.message}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex gap-6">
        {/* Left Column - Form */}
        <div className="md:w-md w-full">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title" className="block">
                Title <span className="text-red-500">*</span>
              </Label>
              <Input
                id="title"
                {...register("commons.title", {
                  required: "Title is required",
                  minLength: {
                    value: 3,
                    message: "Title must be at least 3 characters",
                  },
                })}
                placeholder="Enter article title"
                className={errors.commons?.title ? "border-red-500" : ""}
                aria-invalid={errors?.commons?.title ? "true" : "false"}
                disabled={isPending}
              />
              {errors?.commons?.title && (
                <p className="text-sm text-red-500">
                  {errors?.commons?.title?.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="block">
                Description <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="description"
                {...register("commons.description", {
                  required: "Description is required",
                  minLength: {
                    value: 10,
                    message: "Description must be at least 10 characters",
                  },
                })}
                placeholder="Enter article description"
                className={errors?.commons?.description ? "border-red-500" : ""}
                rows={4}
                aria-invalid={errors?.commons?.description ? "true" : "false"}
                disabled={isPending}
              />
              {errors?.commons?.description && (
                <p className="text-sm text-red-500">
                  {errors?.commons?.description.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="price" className="block">
                Price <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-2.5">€</span>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  min="0"
                  {...register("commons.price", {
                    required: "Price is required",
                    min: {
                      value: 0.01,
                      message: "Price must be a positive number",
                    },
                    valueAsNumber: true,
                  })}
                  placeholder="0.00"
                  className={`pl-7 ${errors?.commons?.price ? "border-red-500" : ""}`}
                  aria-invalid={errors?.commons?.price ? "true" : "false"}
                  disabled={isPending}
                />
              </div>
              {errors?.commons?.price && (
                <p className="text-sm text-red-500">
                  {errors?.commons?.price?.message}
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isPending}
              aria-busy={isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating Article...
                </>
              ) : (
                "Create Article"
              )}
            </Button>
          </form>

          {!state?.success && state?.message && !isPending && (
            <div className="my-8">
              <Alert className="mb-6 bg-red-50 border-red-200">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <AlertTitle className="text-red-800">Error</AlertTitle>
                <AlertDescription className="text-red-700">
                  {state.message}
                </AlertDescription>
              </Alert>
            </div>
          )}
        </div>

        {/* Right Column - Preview */}
        <div className="md:w-full md:inline-block hidden">
          <Card>
            <CardHeader>
              <CardTitle>Article Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <h2 className="text-2xl font-bold mb-2">
                {watchedFields?.commons?.title || "Article Title"}
              </h2>
              <p className="text-xl font-semibold mb-4">
                € {Number(watchedFields?.commons?.price).toFixed(2)}
              </p>
              <div className="text-gray-600 mb-4 whitespace-pre-wrap max-h-60 overflow-auto">
                {watchedFields?.commons?.description ||
                  "Article description will appear here."}
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
