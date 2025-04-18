"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@workspace/ui/components/button";
import { useAuth } from "../../providers/auth-providers";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@workspace/ui/components/dropdown-menu";
import { LogOut, MessageSquare, Plus, User } from "lucide-react";
import { profileOptions } from "#shared/profile-options";

export default function NavBar() {
  const { user, loadingUser, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [open, setOpen] = useState(false);

  return (
    <div className="container flex py-4 px-4 justify-between items-center min-h-14 mx-auto">
      <div className="flex items-center">
        <Link href="/" className="text-xl font-bold">
          Tantovale
        </Link>
      </div>
      <div></div>
      <div className="flex ml-auto items-center">
        {!loadingUser && (
          <Button
            className="w-[90px] mx-2 text-foreground font-bold"
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
            Create
          </Button>
        )}

        {!loadingUser && (
          <>
            {!user ? (
              <>
                <Link href="/login" className="text-muted-foreground">
                  Login
                </Link>
                <Link href="/signup" className="text-muted-foreground">
                  Signup
                </Link>
              </>
            ) : (
              <div className="flex items-center space-x-4">
                <Button
                  variant="ghost"
                  className="relative h-10 w-10 rounded-full"
                  onClick={() => router.push("/auth/chat")}
                >
                  <MessageSquare />
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
