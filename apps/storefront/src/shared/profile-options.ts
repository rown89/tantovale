import UserItemsComponent from "#app/auth/profile/components/selling-items";
import ProfileInfoComponent from "#app/auth/profile/components/info";
import UserSettingsComponent from "#app/auth/profile/components/settings";

import {
  LucideProps,
  Save,
  Settings,
  StretchHorizontal,
  UserPen,
} from "lucide-react";
import { ComponentType } from "react";
import ProfileFavorites from "#app/auth/profile/components/favorites";

interface ProfileOptionsProps {
  Icon: ComponentType<LucideProps>;
  label: string;
  url: string;
  slug: string;
  PageComponent: ComponentType;
}

export const profileOptions: ProfileOptionsProps[] = [
  {
    Icon: UserPen,
    label: "Profile",
    url: "/auth/profile/info",
    slug: "info",
    PageComponent: ProfileInfoComponent,
  },
  {
    Icon: StretchHorizontal,
    label: "Your items",
    url: "/auth/profile/selling-items",
    slug: "selling-items",
    PageComponent: UserItemsComponent,
  },
  {
    Icon: Save,
    label: "Favorites",
    url: "/auth/profile/favorites",
    slug: "favorites",
    PageComponent: ProfileFavorites,
  },
  {
    Icon: Settings,
    label: "Settings",
    url: "/auth/profile/settings",
    slug: "settings",
    PageComponent: UserSettingsComponent,
  },
];
