"use client";

import { useActionState, useEffect } from "react";
import Image from "next/image";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { submitLogin } from "@/app/login/actions";
import { LoginActionResponse } from "@/app/login/types";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { CheckCircle2 } from "lucide-react";
import { useAuth } from "@/context/AuthProvider";
import { useRouter } from "next/navigation";

const initialState: LoginActionResponse = {
  success: false,
  message: "",
};

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const auth = useAuth();
  const router = useRouter();
  const [state, action, isPending] = useActionState(submitLogin, initialState);

  useEffect(() => {
    if (state.success && state?.access_token) {
      auth.setUser(state?.access_token);

      router.push("/");
    }
  }, [state]);

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden">
        <CardContent className="grid p-0 md:grid-cols-2">
          <div className="relative hidden bg-muted md:block">
            <Image
              fill
              priority
              src="/placeholder.svg"
              alt="Image"
              className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
            />
          </div>
          <form action={action} className="p-6 md:p-8">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col items-center text-center">
                <h1 className="text-2xl font-bold">Bentornato</h1>
                <p className="text-balance text-muted-foreground">
                  Entra nel tuo account Tantovale
                </p>
              </div>
              <div className="grid gap-2">
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
                {state?.errors?.email && (
                  <p id="streetAddress-error" className="text-sm text-red-500">
                    {state.errors.email[0]}
                  </p>
                )}
              </div>
              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="password">Password</Label>
                  <a
                    href="#"
                    className="ml-auto text-sm underline-offset-2 hover:underline"
                  >
                    Hai dimenticato la password?
                  </a>
                </div>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  aria-describedby="password-error"
                  defaultValue={state.inputs?.password}
                  className={state?.errors?.password ? "border-red-500" : ""}
                />
                {state?.errors?.password && (
                  <p id="streetAddress-error" className="text-sm text-red-500">
                    {state.errors.password[0]}
                  </p>
                )}
              </div>

              {!state?.success && state?.message && (
                <Alert variant={state.success ? "default" : "destructive"}>
                  {state.success && <CheckCircle2 className="h-4 w-4" />}
                  <AlertDescription>{state.message}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="w-full">
                {isPending ? "Entrando..." : "Continua"}
              </Button>

              <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
                <span className="relative z-10 bg-background px-2 text-muted-foreground">
                  Or continue with
                </span>
              </div>

              <div className="text-center text-sm">
                Non hai un account?{" "}
                <a href="/signup" className="underline underline-offset-4">
                  Registrati
                </a>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
      <div className="text-balance text-center text-xs text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 hover:[&_a]:text-primary">
        Cliccando su continua, accetterai i <a href="#">Terms of Service</a> e
        la <a href="#">Privacy Policy</a>.
      </div>
    </div>
  );
}
