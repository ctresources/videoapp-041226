import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile, profileUsername, uploadPostConfigured } from "@/lib/api/upload-post";
import { partnerAccountId, type PartnerPlatform } from "@/lib/utils/social-platforms";
import type { HaloSetup } from "@/lib/halo";

/**
 * Posting approved Halo videos (2026-10-24).
 *
 * Approve starts the render. The video is only finished once the webhook has
 * stored it with its captions, music and b-roll (render_status "completed");
 * until then there is nothing to post. The halo-post job looks every few
 * minutes, and hands each finished one to the agent's chosen accounts through
 * the same post route the Publish window uses, scheduled for its day. Every
 * caption links back to the Halo post; a promo video's carries #ad.
 */

type Admin = ReturnType<typeof createAdminClient>;

interface DraftRow {
  id: string;
  user_id: string;
  project_id: string | null;
  slot_at: string;
  source: string;
  source_url: string | null;
  setup: HaloSetup;
  approved_at: string;
}

function baseUrl(): string {
  return (process.env.AUTOPILOT_BASE_URL || "https://www.sparkreels.ai").replace(/\/$/, "");
}

/** The accounts this agent actually has connected, of the ones asked for. */
async function connectedOf(admin: Admin, userId: string, wanted: string[]): Promise<string[]> {
  const out: string[] = [];
  const { data } = await admin
    .from("profiles")
    .select("youtube_channel_id, youtube_refresh_token, social_profile_created_at")
    .eq("id", userId)
    .single();
  const p = data as { youtube_channel_id: string | null; youtube_refresh_token: string | null; social_profile_created_at: string | null } | null;
  if (wanted.includes("youtube") && p?.youtube_channel_id && p.youtube_refresh_token) out.push("youtube");
  const others = wanted.filter((w) => w !== "youtube");
  if (others.length && uploadPostConfigured() && p?.social_profile_created_at) {
    try {
      const accounts = (await getProfile(profileUsername(userId)))?.social_accounts ?? {};
      for (const w of others) if (accounts[w] && typeof accounts[w] === "object") out.push(w);
    } catch (err) {
      console.error("[halo-post] reading connected accounts:", err instanceof Error ? err.message : err);
    }
  }
  return out;
}

/** The words that go with the video, everywhere. */
function wordsFor(d: DraftRow, ai: Record<string, unknown>, seo: Record<string, unknown>, title: string) {
  const link = d.source_url ?? "";
  const hook = String(ai.hook || ai.title || title);
  if (d.source === "halo_promo") {
    const code = d.setup.promo?.code;
    const phone = d.setup.promo?.phone;
    const how = code
      ? `Start free: text ${code}${d.setup.promo?.angle === "pro" ? " PRO" : ""} to ${phone ?? "Halo"}.`
      : "";
    const disclosure = "#ad · I earn a referral fee if you join with my code.";
    const caption = [hook, how, link, disclosure].filter(Boolean).join("\n\n");
    return { caption, description: caption, title };
  }
  const caption = [hook, link && `Full post: ${link}`].filter(Boolean).join("\n\n");
  const description = [String(seo.youtube_description || ai.description || hook), link && `Read the full post: ${link}`]
    .filter(Boolean).join("\n\n");
  return { caption, description, title: String(seo.youtube_title || ai.title || title).slice(0, 100) };
}

/**
 * Looks at every approved Halo video not yet handed off: posts the finished
 * ones, notes the failed ones. A few per run; each post can take a minute.
 */
export async function postReadyHaloVideos(admin: Admin, opts: { limit?: number } = {}) {
  const { data } = await admin
    .from("autopilot_drafts")
    .select("id, user_id, project_id, slot_at, source, source_url, setup, approved_at")
    .in("source", ["halo", "halo_promo", "email"])
    .eq("status", "approved")
    .is("posted_at", null)
    .not("approved_at", "is", null)
    .order("approved_at")
    .limit(opts.limit ?? 5);
  const drafts = (data ?? []) as DraftRow[];
  const results: { id: string; outcome: string }[] = [];

  for (const d of drafts) {
    if (!d.project_id) continue;
    const { data: vids } = await admin
      .from("generated_videos")
      .select("id, render_status, video_url, created_at, projects(title, ai_script, seo_data)")
      .eq("project_id", d.project_id)
      .eq("user_id", d.user_id)
      .gte("created_at", new Date(Date.parse(d.approved_at) - 5 * 60_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1);
    const v = (vids ?? [])[0] as unknown as {
      id: string; render_status: string | null; video_url: string | null;
      projects: { title: string | null; ai_script: Record<string, unknown> | null; seo_data: Record<string, unknown> | null } | null;
    } | undefined;

    if (!v) {
      // Waiting in line, or never started. After a day, say so.
      if (Date.now() - Date.parse(d.approved_at) > 24 * 3600_000) {
        await admin.from("autopilot_drafts").update({
          status: "draft", approved_at: null,
          post_error: "The video didn't start. Nothing was charged. Approve to try again.",
        }).eq("id", d.id);
        results.push({ id: d.id, outcome: "never started" });
      }
      continue;
    }
    if (v.render_status === "failed") {
      await admin.from("autopilot_drafts").update({
        status: "draft", approved_at: null, video_id: v.id,
        post_error: "The video couldn't be made. Nothing was charged. Approve to try again.",
      }).eq("id", d.id);
      results.push({ id: d.id, outcome: "render failed" });
      continue;
    }
    if (v.render_status !== "completed" || !v.video_url) continue;

    const platforms = await connectedOf(admin, d.user_id, d.setup.platforms ?? []);
    if (!platforms.length) {
      await admin.from("autopilot_drafts").update({
        status: "scheduled", video_id: v.id, posted_at: new Date().toISOString(),
        post_error: "Your video is ready, but none of its accounts are connected. Post it from My Sparks.",
      }).eq("id", d.id);
      results.push({ id: d.id, outcome: "no accounts" });
      continue;
    }

    const ai = v.projects?.ai_script ?? {};
    const seo = v.projects?.seo_data ?? {};
    const words = wordsFor(d, ai, seo, v.projects?.title ?? "");
    // Its day, or now if that has passed while it was being made.
    const future = Date.parse(d.slot_at) > Date.now() + 10 * 60_000;
    const targets = platforms.map((p) => p === "youtube"
      ? { accountId: "native_youtube", platform: "youtube", title: words.title, description: words.description, privacy: "public" as const, source: "native" as const }
      : { accountId: partnerAccountId(p as PartnerPlatform), platform: p, caption: words.caption, title: words.title, source: "partner" as const });

    let posted: { platform: string; status: string; error?: string }[] = [];
    let failure: string | null = null;
    try {
      const res = await fetch(`${baseUrl()}/api/social/post`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${process.env.CRON_SECRET ?? ""}`,
          "x-autopilot-user": d.user_id,
        },
        body: JSON.stringify({ videoId: v.id, targets, ...(future && { scheduledAt: d.slot_at }) }),
      });
      const out = await res.json().catch(() => ({})) as { results?: typeof posted; error?: string };
      posted = out.results ?? [];
      if (!res.ok && !posted.length) failure = out.error || `Posting failed (${res.status}).`;
    } catch (err) {
      failure = err instanceof Error ? err.message : "Posting failed.";
    }

    const ok = posted.filter((r) => r.status !== "failed");
    const bad = posted.filter((r) => r.status === "failed");
    if (!ok.length) {
      // Kept as approved with the reason, so the card can say what happened;
      // the next run does not retry it (posted_at is set).
      await admin.from("autopilot_drafts").update({
        video_id: v.id, posted_at: new Date().toISOString(), status: "scheduled",
        post_error: failure || bad.map((b) => `${b.platform}: ${b.error ?? "failed"}`).join(" · ") || "Posting failed.",
      }).eq("id", d.id);
      results.push({ id: d.id, outcome: "post failed" });
      continue;
    }
    await admin.from("autopilot_drafts").update({
      video_id: v.id,
      posted_at: new Date().toISOString(),
      status: future ? "scheduled" : "posted",
      post_error: bad.length ? bad.map((b) => `${b.platform}: ${b.error ?? "failed"}`).join(" · ") : null,
    }).eq("id", d.id);
    results.push({ id: d.id, outcome: future ? "scheduled" : "posted" });
  }
  return results;
}
