"use client";

import { useParams, useRouter } from "next/navigation";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/command";
import { useIsMobile } from "@workspace/ui/hooks/use-mobile";
import { CreditCard, LogOut, Settings } from "lucide-react";
import { useAuth } from "#components/providers/AuthProvider";

export default function ProfileMenu() {
  const router = useRouter();
  const { setUser } = useAuth();
  const params = useParams<{ slug: string }>();
  const isMobile = useIsMobile();

  return (
    <>
      {!isMobile && (
        <div className="border rounded-lg  shadow-md w-full md:max-w-[300px]">
          <Command defaultValue={"-"}>
            <CommandList>
              <CommandGroup heading="Profile">
                <CommandItem
                  className={`${params.slug === "items" ? "bg-accent" : "bg-background"}`}
                  onClickCapture={() => {
                    console.log("X");
                    router.push("/auth/profile/items");
                  }}
                >
                  <CreditCard />
                  <span>Your items</span>
                </CommandItem>
                <CommandItem
                  className={`${params.slug === "settings" ? "bg-accent" : "bg-background"}`}
                  onClickCapture={() => router.push("/auth/profile/settings")}
                >
                  <Settings />
                  <span>Settings</span>
                </CommandItem>

                <CommandItem
                  onClickCapture={() => {
                    setUser(null);
                    router.push("/api/logout");
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4 text-red-600" />
                  <span className="text-red-600">Logout</span>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      )}
    </>
  );
}
