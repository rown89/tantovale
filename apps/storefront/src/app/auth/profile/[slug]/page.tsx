import { redirect } from "next/navigation";
import { profileOptions } from "#shared/profile-options";
import { ProfileComponent } from "../components";

interface ProfilePageProps {
  params: Promise<{ slug: string }>;
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { slug } = await params;

  const validPage = profileOptions.find((section) => section.slug === slug);

  if (!validPage) redirect("/404");

  return <ProfileComponent />;
}
