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
        <div className="border rounded-lg shadow-md w-full min-w-[300px] md:max-w-[300px]">
          <Command defaultValue={"-"}>
            <CommandList>
              <CommandGroup heading="Profile" className="flex flex-col gap-1">
                <div className="flex flex-col gap-2">
                  <CommandItem
                    className={`${
                      params.slug === "items"
                        ? "bg-accent text-accent-foreground font-bold"
                        : "bg-background text-foreground  hover:text-muted-foreground"
                    } hover:font-bold hover:cursor-pointer`}
                    onClickCapture={() => {
                      router.push("/auth/profile/items");
                    }}
                  >
                    <CreditCard
                      className={`${
                        params.slug === "items"
                          ? "text-accent-foreground"
                          : "text-foreground"
                      }`}
                    />
                    <span>Your items</span>
                  </CommandItem>
                  <CommandItem
                    className={`${
                      params.slug === "settings"
                        ? "bg-accent text-foreground font-bold"
                        : "bg-background text-foreground  hover:text-muted-foreground"
                    } hover:font-bold hover:cursor-pointer`}
                    onClickCapture={() => router.push("/auth/profile/settings")}
                  >
                    <Settings
                      className={`${
                        params.slug === "settings"
                          ? "bg-accent text-foreground font-bold"
                          : "text-foreground hover:text-muted-foreground"
                      }`}
                    />
                    <span>Settings</span>
                  </CommandItem>

                  <CommandItem
                    className="my-4 bg-background"
                    onClickCapture={() => {
                      setUser(null);
                      router.push("/api/logout");
                    }}
                  >
                    <LogOut />
                    <span>Logout</span>
                  </CommandItem>
                </div>
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      )}
    </>
  );
}
