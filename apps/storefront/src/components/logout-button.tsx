"use client";

import { useAuth } from "@/context/AuthProvider";
import { Button } from "@workspace/ui/components/button";

export default function LogoutButton() {
  const { logout } = useAuth();

  return (
    <Button
      variant="destructive"
      onClick={async () => await logout()}
      className="text-muted-foreground"
    >
      Logout
    </Button>
  );
}
