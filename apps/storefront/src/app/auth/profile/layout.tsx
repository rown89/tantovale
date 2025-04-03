import ProfileMenu from "./components/menu";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container h-[calc(100vh-76px)] flex gap-8 w-full top-4 relative mx-auto">
      <ProfileMenu />
      {children}
    </div>
  );
}
