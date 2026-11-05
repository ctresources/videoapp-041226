"use client";

import { useState } from "react";
import { Loader2, Share2 } from "lucide-react";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import { PhotoPostDialog } from "@/components/social/PhotoPostDialog";

/**
 * Post to socials for a blog (2026-11-04, the owner's ask): a blog with no
 * video goes out as a picture post. The article's header picture, a caption
 * of its headline and a short summary, and a "Read it:" line with the blog's
 * link: the one it's known to be at, or pasted in the window.
 */

interface Post { photo: string; caption: string; link: string }

/** The first couple of sentences, about 220 characters at most. */
function summary(text: string) {
  const plain = text.replace(/^H[23]:\s*/gm, "").replace(/\s+/g, " ").trim();
  if (plain.length <= 220) return plain;
  const cut = plain.slice(0, 220);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return end > 80 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

async function loadPost(projectId: string): Promise<Post | string> {
  const sb = createClient();
  const { data } = await sb.from("projects").select("title, thumbnail_url, ai_script, seo_data").eq("id", projectId).single();
  const p = data as { title: string | null; thumbnail_url: string | null; ai_script: Record<string, unknown> | null; seo_data: Record<string, unknown> | null } | null;
  if (!p) return "Couldn't open this article.";
  const ai = p.ai_script ?? {};
  const seo = p.seo_data ?? {};
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const photo = str(ai.blog_header_url) || str(p.thumbnail_url);
  if (!photo) return "Add a header picture to the article first.";
  const headline = str(ai.blog_headline) || str(ai.title) || str(p.title);
  const about = str(seo.meta_description) || summary(str(ai.blog_intro) || str(ai.blog_body));
  // Where the blog is: pasted in Send to Website, texted to Halo, or the Halo
  // post it came from.
  let link = "";
  try {
    const r = await fetch(`/api/website/send?projectId=${encodeURIComponent(projectId)}`);
    if (r.ok) {
      const w = await r.json() as { postedUrl?: string; haloSent?: { postUrl?: string } | null; halo?: { source?: { url?: string } | null } | null };
      link = w.postedUrl || w.haloSent?.postUrl || w.halo?.source?.url || "";
    }
  } catch { /* the window has a box for it */ }
  const caption = [headline, about, link && `Read it: ${link}`].filter(Boolean).join("\n\n");
  return { photo, caption, link };
}

export function BlogSocialButton({ projectId, className }: { projectId: string; className?: string }) {
  const [post, setPost] = useState<Post | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button type="button" disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await loadPost(projectId);
          setBusy(false);
          if (typeof r === "string") toast.error(r);
          else setPost(r);
        }}
        className={className ?? "flex items-center gap-1.5 rounded-lg border border-spark-rule bg-white px-3 py-1.5 text-xs font-medium text-spark-ink transition-colors hover:border-spark-amber hover:text-spark-amber disabled:opacity-50"}>
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Share2 size={12} />} Post to socials
      </button>
      {post && (
        <PhotoPostDialog photos={[post.photo]} defaultCaption={post.caption} link={post.link}
          heading="Post your blog" onClose={() => setPost(null)} />
      )}
    </>
  );
}
