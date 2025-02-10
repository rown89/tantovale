"use client";

import { useActionState } from "react";
import { signupAction } from "@/app/signup/actions";
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
import { SignupActionResponse } from "@/app/signup/types";

const initialState: SignupActionResponse = {
  success: false,
  message: "",
};

export default function SignupForm() {
  const [state, formAction, isPending] = useActionState(
    signupAction,
    initialState,
  );

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
                placeholder="john@example.com"
                required
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
              <Input id="password" name="password" type="password" required />
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
            {state.message && (
              <p className="mt-4 text-sm text-green-600">{state.message}</p>
            )}
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
