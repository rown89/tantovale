import type { Metadata } from "next";
import localFont from "next/font/local";
import QueryProvider from "./QueryProvider";
import { ThemeProvider } from "@workspace/ui/components/theme-provider";
import { Github, Linkedin } from "lucide-react";

import "@workspace/ui/globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Create Next App",
  description: "Generated by create next app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <QueryProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
          </ThemeProvider>
        </QueryProvider>

        <footer className="py-8 px-4 border-t border-gray-200">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center">
            <p className="text-sm text-gray-600 mb-4 sm:mb-0">
              © 2024 Open Source Marketplace. All rights reserved.
            </p>
            <div className="flex space-x-4">
              <a href="#" className="text-gray-600 hover:text-black">
                <Github className="h-6 w-6" />
              </a>
              <a href="#" className="text-gray-600 hover:text-black">
                <Linkedin className="h-6 w-6" />
              </a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
