"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useSpeechRecognition } from "@/lib/hooks/use-speech-recognition";

/**
 * The topbar's "Hold Space anywhere to talk" hint used to only be true on
 * /create — this is what makes it true everywhere else. There's no mic UI or
 * script field to feed on most pages, so the one coherent thing Space can do
 * app-wide is what the mic always means in this app: spark a new video.
 * Captured speech lands in /create?topic=..., the same query param the
 * Create page already reads to prefill a topic.
 *
 * Disabled on /create and /create/[projectId] — those routes already own
 * their own Space shortcut (or, for the editor's script textarea, explicitly
 * opt out of one), and a second global listener would double-fire.
 */
export function GlobalVoiceShortcut({ disabled }: { disabled: boolean }) {
  const router = useRouter();

  const { listening } = useSpeechRecognition({
    holdSpace: !disabled,
    disabled,
    onSessionEnd: (text) => {
      if (!text.trim()) return;
      router.push(`/create?topic=${encodeURIComponent(text.trim())}`);
    },
  });

  useEffect(() => {
    if (listening) {
      toast("🎙️ Listening… release Space to start a video from what you said", {
        id: "global-voice-shortcut",
        duration: 4000,
      });
    }
  }, [listening]);

  return null;
}
