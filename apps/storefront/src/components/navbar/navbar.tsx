"use client";

import Link from "next/link";
import LogoutButton from "../logout-button";
import { useAuth } from "@/context/AuthProvider";

export default function NavBar() {
  const { user } = useAuth();

  return (
    <div className="flex px-6 py-3 justify-between items-center">
      <div className="flex items-center">
        <Link href="/" className="text-xl font-bold">
          Tantovale
        </Link>
      </div>
      <div></div>
      <div className="flex ml-auto items-center space-x-4">
        {user ? (
          <div className="flex items-center space-x-4">
            <Link href="/profile" className="text-muted-foreground">
              Profile
            </Link>
            <LogoutButton />
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
      </div>
    </div>
  );
}
