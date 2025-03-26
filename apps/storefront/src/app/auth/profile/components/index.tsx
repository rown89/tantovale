"use client";

import { usePathname } from "next/navigation";
import ProfileMenu from "../components/menu";
import { profileOptions } from "#shared/profile-options";

export function ProfileComponent() {
  const pathname = usePathname();

  return (
    <>
      {profileOptions.map((section, i) =>
        section.url === pathname ? (
          <div
            key={i}
            className="container px-6 mx-auto py-6 h-[calc(100vh-56px)] flex gap-8"
          >
            <ProfileMenu />
            <section.PageComponent />
          </div>
        ) : null,
      )}
    </>
  );
}
