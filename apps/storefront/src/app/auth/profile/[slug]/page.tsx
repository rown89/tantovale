import { redirect } from "next/navigation";
import ProfileMenu from "../components/menu";
import UserItemsComponent from "../components/items";

interface ProfilePageProps {
  params: Promise<{ slug: string }>;
}

const availablePaths = ["items", "settings"];

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { slug } = await params;

  if (!slug || !availablePaths.includes(slug)) {
    redirect("/");
  }

  return (
    <div className="container px-6 mx-auto py-6 h-[calc(100vh-56px)] flex gap-8">
      <ProfileMenu />
      {slug === "items" && <UserItemsComponent />}
    </div>
  );
}
