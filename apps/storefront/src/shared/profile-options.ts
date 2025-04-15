import {
  LucideProps,
  Save,
  Settings,
  StretchHorizontal,
  UserPen,
} from "lucide-react";
import { ComponentType } from "react";

interface ProfileOptionsProps {
  Icon: ComponentType<LucideProps>;
  label: string;
  url: string;
  slug: string;
}

export const profileOptions: ProfileOptionsProps[] = [
  {
    Icon: UserPen,
    label: "Profile",
    url: "/auth/profile/info",
    slug: "info",
  },
  {
    Icon: StretchHorizontal,
    label: "Your items",
    url: "/auth/profile/selling-items",
    slug: "selling-items",
  },
  {
    Icon: Save,
    label: "Favorites",
    url: "/auth/profile/favorites",
    slug: "favorites",
  },
  {
    Icon: Settings,
    label: "Settings",
    url: "/auth/profile/settings",
    slug: "settings",
  },
];
