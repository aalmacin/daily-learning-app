import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Providers } from "@/components/Providers";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { signOut } from "@/actions/auth";
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
  title: "Notemaker",
  description: "Personal note-making app",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Notemaker",
  },
  other: {
    "mobile-web-app-capable": "yes",
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
        <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link href="/" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 hover:opacity-80 transition-opacity">
              NoteMaker
            </Link>
            <nav className="flex items-center gap-4">
              {user && (
                <>
                  <Link href="/terms" className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50 transition-colors">
                    Terms
                  </Link>
                  <Link href="/categories" className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50 transition-colors">
                    Categories
                  </Link>
                  <Link href="/review" className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50 transition-colors">
                    Review
                  </Link>
                  <Link href="/settings" className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50 transition-colors">
                    Settings
                  </Link>
                  <form action={signOut}>
                    <button type="submit" className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50 transition-colors">
                      Sign out
                    </button>
                  </form>
                </>
              )}
            </nav>
          </div>
        </header>
        <Providers>{children}</Providers>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
