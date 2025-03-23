import { Nunito_Sans } from "next/font/google";
import type { Metadata } from "next";
import QueryProvider from "./QueryProvider";
import { Toaster } from "@workspace/ui/components/sonner";
import { ThemeProvider } from "../context/ThemeProvider";
import { AuthProvider } from "#context/AuthProvider";
import { cookies } from "next/headers";
import NavBar from "#components/navbar/navbar";

import "@workspace/ui/globals.css";

const font = Nunito_Sans({
  subsets: ["latin"],
  variable: "--font",
});

export const metadata: Metadata = {
  title: "Tantovale",
  description: "Open source marketplace",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("access_token");
  const refreshToken = cookieStore.get("refresh_token");

  const isLogged = accessToken && refreshToken ? true : false;

  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body className={`${font.variable} font`}>
        <ThemeProvider>
          <QueryProvider>
            <AuthProvider isLogged={isLogged}>
              <NavBar />
              {children}
            </AuthProvider>
            <Toaster />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
