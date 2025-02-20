"use client";

import { client } from "@/lib/api";
import { Button } from "@workspace/ui/components/button";

export default function LogoutButton() {
  return (
    <Button
      variant="destructive"
      onClick={async () => {
        try {
          await client.logout.$post();

          await fetch("/api/logout", {
            method: "GET",
            credentials: "include", // ✅ Ensures cookies are sent
          });

          // Redirect to home after logout
          window.location.href = "/";
        } catch (error) {
          console.error("Logout button error: ", error);
        }
      }}
      className="text-muted-foreground"
    >
      Logout
    </Button>
  );
}
