import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { Providers } from "@/components/Providers";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import NavMenu from "@/components/NavMenu";
import { SearchBar } from "@/components/SearchBar";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DailyLearning",
  description: "Personal daily learning app",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "DailyLearning",
  },
};

export const viewport: Viewport = {
  themeColor: '#0e7490',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="relative z-50 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center gap-3">
            <Link href="/" className="text-base md:text-lg font-semibold text-zinc-900 dark:text-zinc-50 hover:opacity-80 transition-opacity shrink-0">
              DailyLearning
            </Link>
            {user && (
              <>
                <div className="flex-1" />
                <Suspense fallback={<div className="min-w-[120px] max-w-[280px] w-[30%]" />}>
                  <SearchBar />
                </Suspense>
                <NavMenu />
              </>
            )}
          </div>
        </header>
        <Providers>{children}</Providers>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
