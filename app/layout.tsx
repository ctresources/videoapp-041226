import type { Metadata } from "next";
import { SupabaseProvider } from "@/providers/supabase-provider";
import { ToastProvider } from "@/providers/toast-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "SparkReels — Speak, Spark, Share",
  description:
    "Real estate agents: transform your voice into viral video content and autopost to all social channels. Reclaim 10-15 hours every week.",
  keywords: ["real estate video", "voice to video", "AI video content", "real estate marketing"],
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
    url: "https://sparkreels.ai",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/apple_touch_180x180.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#3B82F6" />
      </head>
      <body className="bg-brand-bg text-brand-text font-body antialiased">
        <SupabaseProvider>
          <ToastProvider />
          {children}
        </SupabaseProvider>
      </body>
    </html>
  );
}
