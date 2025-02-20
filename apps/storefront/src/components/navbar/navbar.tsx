import { cookies } from "next/headers";
import Link from "next/link";
import LogoutButton from "../logout-button";

export default async function NavBar() {
  const cookieReader = await cookies();
  const accessToken = cookieReader.get("access_token")?.value;

  const user = accessToken;

  return (
    <div className="flex p-2 justify-between items-center">
      <div className="flex items-center">
        <Link href="/" className="text-xl font-bold">
          Tantovale
        </Link>
      </div>
      <div></div>
      <div className="flex ml-auto items-center space-x-4">
        {user ? (
          <div className="flex items-center space-x-4">
            <Link href="/profile" className="text-muted-foreground">
              Profile
            </Link>
            <LogoutButton />
          </div>
        ) : (
          <Link href="/login" className="text-muted-foreground">
            Login
          </Link>
        )}
      </div>
    </div>
  );
}
