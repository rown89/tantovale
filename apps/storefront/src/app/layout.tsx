import { Lato, Geist_Mono } from "next/font/google";
import type { Metadata } from "next";
import QueryProvider from "./QueryProvider";
import { Toaster } from "@workspace/ui/components/sonner";
import { ThemeProvider } from "@workspace/ui/components/theme-provider";
import { AuthProvider } from "#context/AuthProvider";

import NavBar from "#components/navbar/navbar";
import "@workspace/ui/globals.css";
import { cookies } from "next/headers";

const fontSans = Lato({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-sans",
});

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Tantovale",
  description: "open source marketplace",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("access_token");
  const refreshToken = cookieStore.get("access_token");

  const isLogged = accessToken && refreshToken ? true : false;

  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body className={`${fontSans.variable} ${fontMono.variable}`}>
        <QueryProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <AuthProvider isLogged={isLogged}>{children}</AuthProvider>
            <Toaster />
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
