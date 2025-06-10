"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Heart, LogOut, MessageSquare, Plus, User } from "lucide-react";

import { Button } from "@workspace/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@workspace/ui/components/dropdown-menu";

import { useAuth } from "#providers/auth-providers";
import { profileOptions } from "#shared/profile-options";

export default function NavBar() {
  const { user, loadingUser, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [open, setOpen] = useState(false);

  return (
    <div className="container flex py-4 px-4 xl:px-0 justify-between items-center mx-auto min-h-[72px]">
      <div className="flex items-center">
        <Link href="/" className="text-xl font-bold">
          Tantovale
        </Link>
      </div>
      <div></div>
      <div className="flex ml-auto items-center">
        {!loadingUser && (
          <Button
            className="ml-2 mr-3 text-foreground font-bold"
            variant="ghost"
            onClick={async () => {
              if (user) {
                router.push("/auth/item/new");
              } else {
                router.push("/login");
              }
            }}
          >
            <Plus />
            Sell
          </Button>
        )}

        {!loadingUser && (
          <>
            {!user ? (
              <div className="flex items-center">
                <div className="bg-card rounded-lg overflow-hidden border border-border flex">
                  <Link href="/login">
                    <Button
                      variant="ghost"
                      className="px-4 py-2 rounded-none hover:bg-primary hover:text-primary-foreground transition-colors"
                    >
                      Login
                    </Button>
                  </Link>
                  <div className="h-8 self-center w-px bg-border"></div>
                  <Link href="/signup">
                    <Button
                      variant="ghost"
                      className="px-4 py-2 rounded-none hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                      Signup
                    </Button>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <Button
                  variant="ghost"
                  className="relative h-10 w-10 rounded-full"
                  onClick={() => router.push("/auth/chat")}
                >
                  <MessageSquare />
                </Button>
                <Button
                  variant="ghost"
                  className="relative h-10 w-10 rounded-full"
                  onClick={() => router.push("/auth/favorites")}
                >
                  <Heart />
                </Button>
                <DropdownMenu open={open} onOpenChange={setOpen}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className="relative h-10 w-10 rounded-full"
                    >
                      <User />
                    </Button>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent
                    className="w-56 mt-1"
                    align="end"
                    forceMount
                  >
                    <DropdownMenuLabel className="flex gap-1 items-center text-sm font-medium leading-none text-accent mb-1">
                      <span className="text-foreground/40">Hello,</span>
                      <p className="overflow-auto text-ellipsis">
                        {user.username}
                      </p>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />

                    <div className="flex flex-col gap-1">
                      {profileOptions.map((item, i) => (
                        <DropdownMenuItem
                          key={i}
                          className={`hover:font-extrabold hover:cursor-pointer   ${
                            pathname === item.url
                              ? "bg-accent text-accent-foreground font-extrabold"
                              : "text-foreground  hover:text-muted-foreground"
                          }`}
                          onClick={async () => router.push(item.url)}
                        >
                          {
                            <item.Icon
                              className={`
                                ${
                                  pathname === item.url
                                    ? "text-accent-foreground"
                                    : "text-foreground"
                                }`}
                            />
                          }
                          <span>{item.label}</span>
                        </DropdownMenuItem>
                      ))}
                    </div>

                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="hover:cursor-pointer"
                      onClick={async () => logout()}
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Log out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
