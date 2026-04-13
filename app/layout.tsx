import type { Metadata } from "next";
import { SupabaseProvider } from "@/providers/supabase-provider";
import { ToastProvider } from "@/providers/toast-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "VoiceToVideos.AI — Speak, Stream, Share",
  description:
    "Real estate agents: transform your voice into viral video content and autopost to all social channels. Reclaim 10-15 hours every week.",
  keywords: ["real estate video", "voice to video", "AI video content", "real estate marketing"],
  openGraph: {
    title: "VoiceToVideos.AI — Speak, Stream, Share",
    description: "Transform your voice into viral real estate video content automatically.",
    type: "website",
    url: "https://voicetovideos.ai",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-brand-bg text-brand-text font-body antialiased">
        <SupabaseProvider>
          <ToastProvider />
          {children}
        </SupabaseProvider>
      </body>
    </html>
  );
}
