"use client";

import Link from "next/link";
import { useAuth } from "#/context/AuthProvider";
import { Button } from "@workspace/ui/components/button";
import { useRouter } from "next/navigation";

export default function NavBar() {
  const { user, loadingUser, logout } = useAuth();
  const router = useRouter();

  return (
    <div className="container flex px-6 py-2 justify-between items-center min-h-14 mx-auto">
      <div className="flex items-center">
        <Link href="/" className="text-xl font-bold">
          Tantovale
        </Link>
      </div>
      <div></div>
      <div className="flex ml-auto items-center space-x-4">
        {!loadingUser && (
          <>
            {user ? (
              <div className="flex items-center space-x-4">
                <Button
                  variant="default"
                  onClick={async () => router.push("/item/new")}
                  className="text-muted-foreground"
                >
                  Sell
                </Button>
                <Link href="/profile" className="text-muted-foreground">
                  Profile
                </Link>
                <Button
                  variant="destructive"
                  onClick={async () => logout()}
                  className="text-muted-foreground"
                >
                  Logout
                </Button>
              </div>
            ) : (
              <>
                <Link href="/signup" className="text-muted-foreground">
                  Signup
                </Link>
                <Link href="/login" className="text-muted-foreground">
                  Login
                </Link>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
