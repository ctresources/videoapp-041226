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

/**
 * No header picture yet (2026-11-06, the owner's ask): make one the way the
 * Image Generator does for this article (one AI image), save it as the
 * article's header, and use it. Null if it can't be made.
 */
async function makeHeader(projectId: string, headline: string, city: string, state: string): Promise<string | string[] | null> {
  const t = toast.loading("Making a header picture…");
  try {
    const post = async (body: Record<string, unknown>) => {
      const r = await fetch("/api/tools/image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const out = await r.json().catch(() => ({})) as Record<string, unknown>;
      return { ok: r.ok, out };
    };
    const made = await post({ action: "generate", projectId, template: "blog_header", shape: "wide_16x9", headline, city, state });
    const url = (made.out.images as { url?: string }[] | undefined)?.[0]?.url;
    if (!made.ok || !url) return [String(made.out.error ?? "Couldn't make a header picture. Try again.")];
    await post({ action: "attach", projectId, imageUrl: url, target: "blog_header" });
    return url;
  } catch {
    return null;
  } finally {
    toast.dismiss(t);
  }
}

async function loadPost(projectId: string): Promise<Post | string> {
  const sb = createClient();
  const { data } = await sb.from("projects").select("title, thumbnail_url, ai_script, seo_data, location_city, location_state").eq("id", projectId).single();
  const p = data as { title: string | null; thumbnail_url: string | null; ai_script: Record<string, unknown> | null; seo_data: Record<string, unknown> | null; location_city: string | null; location_state: string | null } | null;
  if (!p) return "Couldn't open this article.";
  const ai = p.ai_script ?? {};
  const seo = p.seo_data ?? {};
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const headline = str(ai.blog_headline) || str(ai.title) || str(p.title);
  let photo = str(ai.blog_header_url) || str(p.thumbnail_url);
  if (!photo) {
    const made = await makeHeader(projectId, str(ai.blog_headline) || str(ai.title), str(p.location_city), str(p.location_state));
    if (Array.isArray(made)) return made[0];
    if (!made) return "Couldn't make a header picture. Try again.";
    photo = made;
  }
  const about = str(seo.meta_description) || summary(str(ai.blog_intro) || str(ai.blog_body) || str(seo.youtube_description));
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
