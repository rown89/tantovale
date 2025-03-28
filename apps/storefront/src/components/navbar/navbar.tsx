"use client";

import Link from "next/link";
import { useAuth } from "#components/providers/AuthProvider";
import { useTheme } from "next-themes";
import { Button } from "@workspace/ui/components/button";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@workspace/ui/components/dropdown-menu";
import { LogOut, Moon, Sun } from "lucide-react";
import { profileOptions } from "#shared/profile-options";

export default function NavBar() {
  const { user, loadingUser, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();

  const [open, setOpen] = useState(false);

  const initials = user?.username
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();

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
          <Button
            className="w-[90px] mx-12 text-slate-900 font-bold"
            variant="secondary"
            onClick={async () => {
              if (user) {
                router.push("/auth/item/new");
              } else {
                router.push("/login");
              }
            }}
          >
            Create ad
          </Button>
        )}

        {!loadingUser && (
          <>
            {!user ? (
              <>
                <Link href="/signup" className="text-muted-foreground">
                  Signup
                </Link>
                <Link href="/login" className="text-muted-foreground">
                  Login
                </Link>
              </>
            ) : (
              <div className="flex items-center space-x-4">
                <DropdownMenu open={open} onOpenChange={setOpen}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className="relative h-10 w-10 rounded-full"
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={""} alt={user.username} />
                        <AvatarFallback>{initials}</AvatarFallback>
                      </Avatar>
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
