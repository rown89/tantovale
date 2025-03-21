"use client";

import { useActionState, useEffect } from "react";
import { signupAction } from "#app/signup/actions";
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
import { AlertCircle } from "lucide-react";
import { SignupActionResponse } from "#app/signup/types";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

const initialState: SignupActionResponse = {
  success: false,
  message: "",
};

export default function SignupForm() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    signupAction,
    initialState,
  );

  useEffect(() => {
    if (state.success) {
      toast(`Ciao, ${state.inputs?.username}`, {
        description: "Controlla la tua email per attivare l'account",
        duration: 6000,
      });

      router.replace("/");
    }
  }, [state.inputs?.username, state.success]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <Card className="w-full max-w-md">
        <form action={formAction}>
          <CardHeader>
            <CardTitle>Registrati</CardTitle>
            <CardDescription>Crea il tuo account per iniziare</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                name="username"
                type="text"
                placeholder="johndoe"
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
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
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
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                aria-describedby="password-error"
                defaultValue={state.inputs?.password}
                className={state?.errors?.password ? "border-red-500" : ""}
              />
              {state.errors?.password && (
                <p className="text-sm text-red-500 flex items-center">
                  <AlertCircle className="w-4 h-4 mr-1" />
                  {state.errors.password}
                </p>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex flex-col items-center">
            <Button type="submit" className="w-full" disabled={isPending}>
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
