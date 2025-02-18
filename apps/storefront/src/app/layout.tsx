import { Lato, Geist_Mono } from "next/font/google";
import type { Metadata } from "next";
import QueryProvider from "./QueryProvider";
import { Toaster } from "@workspace/ui/components/sonner";
import { ThemeProvider } from "@workspace/ui/components/theme-provider";

import "@workspace/ui/globals.css";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
            {children}
            <Toaster />
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
