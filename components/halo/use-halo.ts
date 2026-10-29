"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import type { HaloSettings, HaloSetup, PromoAngle } from "@/lib/halo";

/**
 * Everything the AutoSparks page shows about Halo (2026-10-24): settings,
 * sites, this month's Halo drafts, the other new pages, the agent's avatar
 * looks and connected accounts, and the actions on them.
 */

export interface HaloSite {
  id: string; url: string; is_affiliate: boolean;
  last_checked_at: string | null; last_error: string | null;
}
export interface HaloDraft {
  id: string;
  slot_at: string;
  status: "writing" | "draft" | "approved" | "scheduled" | "posted" | "skipped" | "failed";
  source: "halo" | "halo_promo" | "email" | "sparklee";
  source_url: string | null;
  source_kind: string | null;
  topic: string;
  setup: HaloSetup;
  project_id: string | null;
  halo_page_id: string | null;
  video_id: string | null;
  post_error: string | null;
  /** Seen on its Halo post, or marked so (2026-10-26). */
  on_halo_at?: string | null;
  projects: {
    title: string | null; thumbnail_url: string | null; location_city: string | null; location_state: string | null;
    ai_script: { hook?: string; script?: string; cta?: string; title?: string } | null;
    /** For the card's word and thumbnail editors (2026-10-26). */
    seo_data?: {
      youtube_title?: string; youtube_description?: string;
      thumbnail_headline?: string; thumbnail_style?: unknown; thumbnail_tall_url?: string;
    } | null;
  } | null;
  /** Filled in after posting: the YouTube link and the finished file. */
  youtubeUrl?: string | null;
  videoUrl?: string | null;
  /** A video already made (or being made) from this draft, with its file to watch. */
  madeVideo?: { id: string; ready: boolean; url: string | null } | null;
  /** Where the video has really gone, for the status line (2026-10-26). */
  posts?: { platform: string; post_status: string; scheduled_at: string | null }[];
  /** The card's video: finished and failed, for the status line. */
  videoReady?: boolean;
  videoFailed?: boolean;
}
export interface HaloPageItem { id: string; url: string; kind: string; title: string | null; image_url: string | null }
export interface Look { id: string; name: string; preview_image_url: string | null; status: string | null }

async function post(url: string, body: unknown, method = "POST") {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, out: out as Record<string, unknown> };
}

export function useHalo(userId: string | undefined) {
  const [settings, setSettings] = useState<HaloSettings | null>(null);
  const [sites, setSites] = useState<HaloSite[]>([]);
  const [drafts, setDrafts] = useState<HaloDraft[]>([]);
  const [pages, setPages] = useState<HaloPageItem[]>([]);
  const [looks, setLooks] = useState<Look[]>([]);
  const [twinLookId, setTwinLookId] = useState<string | null>(null);
  /** Both twins and their outfits (2026-10-29), all marked TWIN in the picker. */
  const [twinLookIds, setTwinLookIds] = useState<string[]>([]);
  const [connected, setConnected] = useState<string[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const checkedOnPost = useRef(false);
  const loadDraftsRef = useRef<(() => Promise<void>) | null>(null);

  const loadDrafts = useCallback(async () => {
    if (!userId) return;
    const sb = createClient();
    const since = new Date(Date.now() - 21 * 86_400_000).toISOString();
    const { data } = await sb
      .from("autopilot_drafts")
      .select("id, slot_at, status, source, source_url, source_kind, topic, setup, project_id, halo_page_id, video_id, post_error, on_halo_at, projects(title, thumbnail_url, location_city, location_state, ai_script, seo_data)")
      .in("source", ["halo", "halo_promo", "email", "sparklee"])
      .neq("status", "skipped")
      .gte("slot_at", since)
      .order("slot_at");
    const list = (data ?? []) as unknown as HaloDraft[];
    // Drafts still to approve whose video was already made elsewhere (the
    // editor): Approve then posts that one instead of making another.
    const open = list.filter((d) => d.status === "draft" && d.project_id).map((d) => d.project_id as string);
    if (open.length) {
      const { data: made } = await sb.from("generated_videos").select("id, project_id, render_status, video_url, created_at")
        .in("project_id", open).neq("render_status", "failed").order("created_at", { ascending: false });
      const byProject = new Map<string, { id: string; ready: boolean; url: string | null }>();
      for (const m of (made ?? []) as { id: string; project_id: string; render_status: string | null; video_url: string | null }[]) {
        if (!byProject.has(m.project_id)) {
          byProject.set(m.project_id, { id: m.id, ready: m.render_status === "completed" && !!m.video_url, url: m.video_url });
        }
      }
      for (const d of list) if (d.status === "draft" && d.project_id) d.madeVideo = byProject.get(d.project_id) ?? null;
    }
    // The YouTube link and file for "Put on my Halo post", for any card with a
    // video, including one the agent posted by hand (2026-10-26).
    const vidOf = (d: HaloDraft) => d.video_id ?? d.madeVideo?.id ?? null;
    const vids = list.map(vidOf).filter((v): v is string => !!v);
    if (vids.length) {
      const [{ data: posts }, { data: files }] = await Promise.all([
        sb.from("social_posts").select("video_id, platform, post_status, scheduled_at, platform_post_id").in("video_id", vids),
        sb.from("generated_videos").select("id, video_url, render_status").in("id", vids),
      ]);
      type P = { video_id: string; platform: string; post_status: string; scheduled_at: string | null; platform_post_id: string | null };
      const rows = (posts ?? []) as P[];
      const yt = new Map(rows.filter((p) => p.platform === "youtube" && p.platform_post_id).map((p) => [p.video_id, `https://youtu.be/${p.platform_post_id}`]));
      const file = new Map(((files ?? []) as { id: string; video_url: string | null; render_status: string | null }[]).map((f) => [f.id, f]));
      for (const d of list) {
        const v = vidOf(d);
        if (!v) continue;
        const f = file.get(v);
        d.youtubeUrl = yt.get(v) ?? null;
        d.videoUrl = f?.video_url ?? null;
        d.videoReady = f?.render_status === "completed" && !!f.video_url;
        d.videoFailed = f?.render_status === "failed";
        d.posts = rows.filter((p) => p.video_id === v).map(({ platform, post_status, scheduled_at }) => ({ platform, post_status, scheduled_at }));
      }
    }
    setDrafts(list);
    // Posted Halo videos not yet seen on their post: look once now rather
    // than waiting for the morning run (2026-10-26).
    if (!checkedOnPost.current && list.some((d) => d.source === "halo" && (d.status === "posted" || d.status === "scheduled") && !d.on_halo_at)) {
      checkedOnPost.current = true;
      void fetch("/api/halo/on-post", { method: "POST" })
        .then((r) => (r.ok ? r.json() : null))
        .then((b) => { if (b?.found) void loadDraftsRef.current?.(); })
        .catch(() => {});
    }
  }, [userId]);
  loadDraftsRef.current = loadDrafts;

  const loadPages = useCallback(async (types: string[]) => {
    if (!userId) return;
    const { data } = await createClient()
      .from("halo_pages")
      .select("id, url, kind, title, image_url, halo_sites!inner(is_affiliate)")
      .eq("status", "new")
      .eq("halo_sites.is_affiliate", false)
      .in("kind", types.includes("other") ? ["blog", "guides", "events", "market", "neighborhoods", "communities", "relocation", "dining", "just_sold", "other"] : types)
      .order("first_seen_at", { ascending: false })
      .limit(8);
    setPages((data ?? []) as unknown as HaloPageItem[]);
  }, [userId]);

  const loadAll = useCallback(async () => {
    const res = await fetch("/api/halo/settings");
    if (!res.ok) { setLoaded(true); return; }
    const body = await res.json() as { settings: HaloSettings; sites: HaloSite[] };
    setSettings(body.settings);
    setSites(body.sites);
    await Promise.all([loadDrafts(), loadPages(body.settings.types)]);
    setLoaded(true);
  }, [loadDrafts, loadPages]);

  useEffect(() => {
    if (!userId) return;
    void loadAll();
    fetch("/api/avatar/looks").then((r) => (r.ok ? r.json() : null)).then((b) => {
      if (!b) return;
      // Twins first (both twins and their outfits, 2026-10-29): the picker
      // used to show only the first 8 looks, and photo looks come first, so
      // the owner's twin was cut off the end.
      const twinIds: string[] = Array.isArray(b.twinLookIds) ? b.twinLookIds : [];
      const ready = ((b.looks ?? []) as Look[]).filter((l) => !l.status || l.status === "completed" || l.status === "active");
      setLooks([...ready.filter((l) => twinIds.includes(l.id)), ...ready.filter((l) => !twinIds.includes(l.id))]);
      setTwinLookIds(twinIds);
      setTwinLookId(typeof b.twinLookId === "string" ? b.twinLookId : null);
    }).catch(() => {});
    fetch("/api/social/accounts").then((r) => (r.ok ? r.json() : null)).then((b) => {
      if (!b) { setConnected([]); return; }
      const ids = ((b.accounts ?? []) as { platform: string; needsReconnect?: boolean }[]).map((a) => a.platform);
      setConnected(Array.from(new Set(ids)));
    }).catch(() => setConnected([]));
  }, [userId, loadAll]);

  // Watch drafts being written, made or posted.
  useEffect(() => {
    if (!drafts.some((d) => d.status === "writing" || d.status === "approved" || (d.madeVideo && !d.madeVideo.ready))) return;
    const t = setInterval(() => void loadDrafts(), 15000);
    return () => clearInterval(t);
  }, [drafts, loadDrafts]);

  const saveSettings = useCallback(async (patch: Partial<HaloSettings>) => {
    if (!settings) return;
    const before = settings;
    setSettings({ ...settings, ...patch });
    const r = await post("/api/halo/settings", patch);
    if (!r.ok) { setSettings(before); toast.error(String(r.out.error ?? "Couldn't save that. Try again.")); return; }
    setSettings(r.out.settings as HaloSettings);
    if (patch.types) void loadPages((r.out.settings as HaloSettings).types);
    // New days may be getting written.
    setTimeout(() => void loadDrafts(), 1500);
  }, [settings, loadPages, loadDrafts]);

  const addSite = useCallback(async (url: string) => {
    const r = await post("/api/halo/sites", { url });
    if (!r.ok) { toast.error(String(r.out.error ?? "Couldn't add that site.")); return false; }
    toast.success("Added. New posts will show up on AutoSparks as drafts.");
    await loadAll();
    return true;
  }, [loadAll]);

  const removeSite = useCallback(async (id: string) => {
    const r = await post("/api/halo/sites", { id }, "DELETE");
    if (!r.ok) { toast.error(String(r.out.error ?? "Couldn't remove it.")); return; }
    setSites((s) => s.filter((x) => x.id !== id));
  }, []);

  const draftAction = useCallback(async (body: Record<string, unknown>) => {
    const r = await post("/api/halo/draft", body);
    if (!r.ok) toast.error(String(r.out.error ?? "Couldn't save that. Try again."));
    return r;
  }, []);

  const patchSetup = useCallback(async (d: HaloDraft, patch: Partial<HaloSetup>) => {
    setDrafts((list) => list.map((x) => (x.id === d.id ? { ...x, setup: { ...x.setup, ...patch } } : x)));
    const r = await draftAction({ draftId: d.id, action: "setup", setup: patch });
    if (r.ok) setDrafts((list) => list.map((x) => (x.id === d.id ? { ...x, setup: r.out.setup as HaloSetup } : x)));
    else void loadDrafts();
  }, [draftAction, loadDrafts]);

  const setWhen = useCallback(async (d: HaloDraft, slotAt: string) => {
    const r = await draftAction({ draftId: d.id, action: "when", slotAt });
    if (r.ok) void loadDrafts();
  }, [draftAction, loadDrafts]);

  const setPicture = useCallback(async (d: HaloDraft, picture: "post" | "ai" | "upload", file?: File) => {
    let pictureUrl: string | undefined;
    if (picture === "upload") {
      if (!file || !userId) return;
      if (file.size > 8 * 1024 * 1024) { toast.error("Pick a picture under 8 MB."); return; }
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${userId}/halo/${d.id}-${Date.now()}.${ext}`;
      const sb = createClient();
      const { error } = await sb.storage.from("assets").upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (error) { toast.error("Couldn't upload that picture."); return; }
      pictureUrl = sb.storage.from("assets").getPublicUrl(path).data.publicUrl;
    }
    const t = toast.loading("Making the thumbnail…");
    const r = await draftAction({ draftId: d.id, action: "picture", picture, pictureUrl });
    toast.dismiss(t);
    if (r.ok) { toast.success("Thumbnail updated."); void loadDrafts(); }
  }, [draftAction, loadDrafts, userId]);

  const skip = useCallback(async (d: HaloDraft) => {
    setDrafts((list) => list.filter((x) => x.id !== d.id));
    const r = await draftAction({ draftId: d.id, action: "skip" });
    if (!r.ok) void loadDrafts();
    else setTimeout(() => { void loadDrafts(); if (settings) void loadPages(settings.types); }, 2000);
  }, [draftAction, loadDrafts, loadPages, settings]);

  const useInstead = useCallback(async (pageId: string, replaceDraftId: string) => {
    const r = await draftAction({ action: "use", pageId, replaceDraftId });
    if (r.ok) {
      toast.success("Writing it now. It'll be ready in about a minute.");
      await loadDrafts();
      if (settings) void loadPages(settings.types);
    }
  }, [draftAction, loadDrafts, loadPages, settings]);

  /** Make video: renders it, posts nothing. Approve comes after watching it. */
  const make = useCallback(async (d: HaloDraft): Promise<Record<string, unknown> | null> => {
    const r = await post("/api/halo/approve", { draftId: d.id, make: true });
    if (r.ok) {
      toast.success(r.out.ready
        ? "Your video is ready. Watch it, then approve it to post."
        : "Making your video. Watch it here when it's done, then approve it to post.");
      void loadDrafts();
      return null;
    }
    return { ...r.out, status: r.status };
  }, [loadDrafts]);

  const approve = useCallback(async (d: HaloDraft): Promise<Record<string, unknown> | null> => {
    const r = await post("/api/halo/approve", { draftId: d.id });
    if (r.ok) {
      toast.success("Approved. It posts by itself on its day. Don't post it yourself.");
      void loadDrafts();
      return null;
    }
    return { ...r.out, status: r.status };
  }, [loadDrafts]);

  /** It's on my post (or not yet): stops the card asking to text Halo. */
  const markOnHalo = useCallback(async (d: HaloDraft, value: boolean) => {
    setDrafts((list) => list.map((x) => (x.id === d.id ? { ...x, on_halo_at: value ? new Date().toISOString() : null } : x)));
    const r = await draftAction({ draftId: d.id, action: "onHalo", value });
    if (!r.ok) void loadDrafts();
  }, [draftAction, loadDrafts]);

  const promo = useCallback(async (siteId: string, angle: PromoAngle, replaceDraftId?: string) => {
    const r = await post("/api/halo/promo", { siteId, angle, replaceDraftId });
    if (!r.ok) { toast.error(String(r.out.error ?? "Couldn't start the promo video.")); return false; }
    toast.success("Writing your promo video. It'll show below in about a minute.");
    void loadDrafts();
    return true;
  }, [loadDrafts]);

  return {
    loaded, settings, sites, drafts, pages, looks, twinLookId, twinLookIds, connected,
    saveSettings, addSite, removeSite, patchSetup, setWhen, setPicture, skip, useInstead, make, approve, promo, markOnHalo,
    reload: loadAll,
    reloadDrafts: loadDrafts,
  };
}

export type Halo = ReturnType<typeof useHalo>;
