import type { Metadata } from "next";
import { SupabaseProvider } from "@/providers/supabase-provider";
import { ToastProvider } from "@/providers/toast-provider";
import { Clarity } from "@/components/analytics/clarity";
import "./globals.css";

export const metadata: Metadata = {
  title: "SparkReels — Speak, Spark, Share",
  description:
    "Real estate agents: transform your voice into viral video content and autopost to all social channels. Reclaim 10-15 hours every week.",
  keywords: ["real estate video", "voice to video", "AI video content", "real estate marketing"],
  applicationName: "SparkReels",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SparkReels",
  },
  openGraph: {
    title: "SparkReels — Speak, Spark, Share",
    description: "Transform your voice into viral real estate video content automatically.",
    type: "website",
    url: "https://www.sparkreels.ai",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* SparkReels SR icons (2026-10-16). /favicon.ico is app/favicon.ico,
            which Next links itself (a second copy in public/ made the dev
            server refuse to serve either). The manifest link comes from
            `metadata.manifest` above; it carries the 192, 512 and maskable icons. */}
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#3B82F6" />
        <meta name="google-site-verification" content="uAWjEr9Xm843nq9tUGWMqYkSpUlvvlTmoIjn8ffkYlA" />
      </head>
      <body className="bg-brand-bg text-brand-text font-body antialiased">
        <SupabaseProvider>
          <ToastProvider />
          {/* Visit recordings, with the app masked and Google-data pages
              left out (components/analytics/clarity.tsx, 2026-10-20). */}
          <Clarity />
          {children}
        </SupabaseProvider>
      </body>
    </html>
  );
}
