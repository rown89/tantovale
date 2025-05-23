"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Button } from "@workspace/ui/components/button";

import { Separator } from "@workspace/ui/components/separator";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "@workspace/ui/components/select";
import { Checkbox } from "@workspace/ui/components/checkbox";

import { signupAction } from "../../../app/signup/actions";
import { SignupActionResponse } from "../../../app/signup/types";

const initialState: SignupActionResponse = {
  success: false,
  message: "",
};

export default function SignupForm() {
  const [state, formAction, isPending] = useActionState(
    signupAction,
    initialState,
  );

  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      toast(`Ciao, ${state.inputs?.username}`, {
        description: "Controlla la tua email per attivare l'account",
        duration: 6000,
      });

      router.replace("/");
    }
  }, [state]);

  return (
    <div className="container h-full sm:h-[calc(100vh-56px)] flex items-center justify-center p-2 xl:p-0 mx-auto">
      <Card className="w-full max-w-md">
        <form action={formAction}>
          <CardHeader>
            <CardTitle className="text-primary">Registrati</CardTitle>
            <CardDescription>Crea il tuo account per iniziare</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-col gap-4">
              <Label htmlFor="username">
                Username <span className="text-red-500">*</span>
              </Label>
              <Input
                id="username"
                name="username"
                type="text"
                placeholder="Pick a cool username :)"
                required
                defaultValue={state.inputs?.username}
                className={state?.errors?.username ? "border-red-500" : ""}
              />
              {state.errors?.username && (
                <p className="text-sm text-red-500 flex items-center">
                  <AlertCircle className="w-4 h-4 mr-1" />
                  {state.errors.username}
                </p>
              )}
            </div>
            <Separator className="mt-7 mb-6" />
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-4">
                  <Label htmlFor="name">
                    Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="name"
                    name="name"
                    type="text"
                    placeholder="Mario"
                    required
                    defaultValue={state.inputs?.name}
                    className={state?.errors?.name ? "border-red-500" : ""}
                  />
                  {state.errors?.name && (
                    <p className="text-sm text-red-500 flex items-center">
                      <AlertCircle className="w-4 h-4 mr-1" />
                      {state.errors.name}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-4">
                  <Label htmlFor="surname">
                    Surname <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="surname"
                    name="surname"
                    type="text"
                    placeholder="Rossi"
                    required
                    defaultValue={state.inputs?.surname}
                    className={state?.errors?.surname ? "border-red-500" : ""}
                  />
                  {state.errors?.surname && (
                    <p className="text-sm text-red-500 flex items-center">
                      <AlertCircle className="w-4 h-4 mr-1" />
                      {state.errors.surname}
                    </p>
                  )}
                </div>
              </div>
              <Separator className="mt-3 mb-2" />
              <div className="flex flex-col gap-4">
                <Label htmlFor="gender">
                  Gender <span className="text-red-500">*</span>
                </Label>
                <Select
                  name="gender"
                  required
                  defaultValue={state.inputs?.gender}
                >
                  <SelectTrigger className="w-full bg-input/30">
                    <SelectValue placeholder={`Select your gender`} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {["male", "female"]?.map((item, i) => (
                        <SelectItem key={i} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {state.errors?.gender && (
                  <p className="text-sm text-red-500 flex items-center">
                    <AlertCircle className="w-4 h-4 mr-1" />
                    {state.errors.gender}
                  </p>
                )}
              </div>
            </div>
            <Separator className="mt-7 mb-6" />
            <div className="flex flex-col gap-4">
              <Label htmlFor="email">
                Email <span className="text-red-500">*</span>
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                aria-describedby="email-error"
                placeholder="email@example.com"
                defaultValue={state.inputs?.email}
                className={state?.errors?.email ? "border-red-500" : ""}
              />
              {state.errors?.email && (
                <p className="text-sm text-red-500 flex items-center">
                  <AlertCircle className="w-4 h-4 mr-1" />
                  {state.errors.email}
                </p>
              )}
              <Label htmlFor="password">
                Password <span className="text-red-500">*</span>
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="********"
                required
                aria-describedby="password-error"
                defaultValue={state?.inputs?.password}
                className={state?.errors?.password ? "border-red-500" : ""}
              />
              {state.errors?.password && (
                <p className="text-sm text-red-500 flex items-center">
                  <AlertCircle className="w-4 h-4 mr-1" />
                  {state.errors.password}
                </p>
              )}
            </div>
            <Separator className="my-6" />
            <div className="flex flex-col gap-4">
              <div className="flex gap-1 items-center">
                <Checkbox
                  id="privacy_policy"
                  name="privacy_policy"
                  defaultChecked={state.inputs?.privacy_policy}
                  className="w-4 h-4 border border-gray-300 rounded bg-gray-50 focus:ring-3 focus:ring-blue-300"
                />
                <Label
                  htmlFor="privacy_policy"
                  className="ml-2 text-sm font-medium"
                >
                  Ho letto e accetto la{" "}
                  <Link
                    href="/privacy-policy"
                    className="underline hover:text-primary"
                  >
                    Privacy Policy
                  </Link>
                  {"  "}
                  <span className="text-red-500">*</span>
                </Label>
              </div>
              {state.errors?.privacy_policy && (
                <p className="text-sm text-red-500 flex items-center w-full mb-4">
                  <AlertCircle className="w-4 h-4 mr-1" />
                  {state.errors.privacy_policy}
                </p>
              )}
              <div className="flex gap-1 items-center">
                <Checkbox
                  id="marketing_policy"
                  name="marketing_policy"
                  defaultChecked={state.inputs?.marketing_policy}
                  className="w-4 h-4 border border-gray-300 rounded bg-gray-50 focus:ring-3 focus:ring-blue-300"
                />
                <Label
                  htmlFor="marketing_policy"
                  className="ml-2 text-sm font-medium"
                >
                  Ho letto e accetto la{" "}
                  <Link
                    href="/marketing-policy"
                    className="underline hover:text-primary"
                  >
                    Marketing Policy
                  </Link>{" "}
                </Label>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col items-center">
            <Button
              type="submit"
              className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              disabled={isPending}
            >
              {isPending ? "Registrazione..." : "Registrati"}
            </Button>

            {!state.success && state.message && (
              <p className={`mt-4 text-sm ${"text-red-500"} `}>
                {state.message}
              </p>
            )}
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
