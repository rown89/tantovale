// app/protected/page.tsx (Client Component)
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthProvider";

export default function ProtectedPage() {
  const { user, loadingUser } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loadingUser && !user) {
      router.push("/login");
    }
  }, [user, loadingUser]);

  if (!user) return <div>Loading...</div>;

  return <div>Protected client content for {user.username}</div>;
}
