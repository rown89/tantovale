import { Lato, Geist_Mono } from "next/font/google";
import type { Metadata } from "next";
import QueryProvider from "./QueryProvider";
import { Toaster } from "@workspace/ui/components/sonner";
import { ThemeProvider } from "@workspace/ui/components/theme-provider";
import { AuthProvider } from "@/context/AuthProvider";

import "@workspace/ui/globals.css";
import NavBar from "@/components/navbar/navbar";
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
  const cookieReader = await cookies();
  const accessToken = cookieReader.get("access_token")?.value;

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
            <AuthProvider access_token={accessToken}>
              <NavBar />
              {children}
            </AuthProvider>
            <Toaster />
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
