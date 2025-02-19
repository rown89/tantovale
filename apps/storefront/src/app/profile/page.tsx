import { getServerAuth } from "@/lib/getServerAuth";
import { redirect } from "next/navigation";

export default async function ProfilePage() {
  const user = await getServerAuth();
  if (!user) {
    redirect("/login");
  }

  return (
    <div>
      <h1>Welcome, {user.username}!</h1>
    </div>
  );
}
