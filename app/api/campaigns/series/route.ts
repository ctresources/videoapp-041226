/**
 * POST /api/campaigns/series — everything a Spark Series can do.
 *
 *   { action: "create",   name, sparkId? }        make a Series, optionally with its first Spark
 *   { action: "rename",   seriesId, name }
 *   { action: "defaults", seriesId, cta_text, destination_url }
 *   { action: "reorder",  seriesId, order: [sparkId, …] }
 *   { action: "plan",     seriesId, name }        a name-only Spark: a planned slot
 *   { action: "move",     sparkId, seriesId | null }
 *   { action: "delete",   seriesId }              the Sparks stay, unfiled
 *
 * Inherited values are never lost: before a Spark leaves a Series — one at a
 * time, or because the Series is deleted — the Series' CTA and destination
 * link are written onto any Spark that was relying on them.
 *
 * Only for accounts granted the calendar; everyone else gets a 404.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCampaignUser } from "@/lib/utils/campaign-access";
import { isHttpUrl } from "@/lib/utils/campaigns";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Admin = ReturnType<typeof createAdminClient>;

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

const NAME_LIMIT = 200;
const CTA_LIMIT = 500;

interface SeriesRow { id: string; cta_text: string | null; destination_url: string | null }

function cleanName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.length > NAME_LIMIT) return null;
  return s;
}

/** The Series, if it belongs to this user. */
async function ownedSeries(admin: Admin, userId: string, seriesId: unknown): Promise<SeriesRow | null> {
  if (typeof seriesId !== "string" || !seriesId) return null;
  const { data } = await admin
    .from("spark_series")
    .select("id, cta_text, destination_url")
    .eq("id", seriesId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as SeriesRow | null) ?? null;
}

/**
 * Copy the Series' CTA and link onto the Sparks that were inheriting them,
 * so leaving the Series changes nothing the user can see.
 */
async function keepInherited(admin: Admin, userId: string, series: SeriesRow, sparkIds?: string[]): Promise<void> {
  if (!series.cta_text && !series.destination_url) return;
  for (const [column, value] of [["cta_text", series.cta_text], ["destination_url", series.destination_url]] as const) {
    if (!value) continue;
    let q = admin.from("campaigns").update({ [column]: value }).eq("user_id", userId).is(column, null);
    q = sparkIds ? q.in("id", sparkIds) : q.eq("series_id", series.id);
    await q;
  }
}

/** One past the last position in the Series. */
async function nextPosition(admin: Admin, userId: string, seriesId: string): Promise<number> {
  const { data } = await admin
    .from("campaigns")
    .select("series_position")
    .eq("user_id", userId)
    .eq("series_id", seriesId)
    .order("series_position", { ascending: false })
    .limit(1);
  const top = (data ?? [])[0] as { series_position: number | null } | undefined;
  return (top?.series_position ?? -1) + 1;
}

export async function POST(req: NextRequest) {
  const access = await requireCampaignUser();
  if ("response" in access) return access.response;
  const { userId } = access;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return bad("Nothing to do.");
  const admin = createAdminClient();

  switch (body.action) {
    // ── Make a Series ────────────────────────────────────────────────────────
    case "create": {
      const name = cleanName(body.name);
      if (!name) return bad("Give the Series a name.");
      const { data, error } = await admin
        .from("spark_series")
        .insert({ user_id: userId, name })
        .select("id")
        .single();
      const seriesId = (data as { id: string } | null)?.id;
      if (error || !seriesId) return NextResponse.json({ error: "Couldn't create the Series." }, { status: 500 });

      if (typeof body.sparkId === "string" && body.sparkId) {
        await admin
          .from("campaigns")
          .update({ series_id: seriesId, series_position: 0 })
          .eq("id", body.sparkId)
          .eq("user_id", userId);
      }
      return NextResponse.json({ ok: true, seriesId });
    }

    // ── Rename ───────────────────────────────────────────────────────────────
    case "rename": {
      const series = await ownedSeries(admin, userId, body.seriesId);
      if (!series) return NextResponse.json({ error: "Series not found." }, { status: 404 });
      const name = cleanName(body.name);
      if (!name) return bad("Give the Series a name.");
      await admin.from("spark_series").update({ name }).eq("id", series.id).eq("user_id", userId);
      return NextResponse.json({ ok: true });
    }

    // ── Shared CTA and link ──────────────────────────────────────────────────
    case "defaults": {
      const series = await ownedSeries(admin, userId, body.seriesId);
      if (!series) return NextResponse.json({ error: "Series not found." }, { status: 404 });

      const update: Record<string, string | null> = {};
      if ("cta_text" in body) {
        const v = body.cta_text;
        if (v !== null && typeof v !== "string") return bad("The CTA must be text.");
        const s = typeof v === "string" ? v.trim() : "";
        if (s.length > CTA_LIMIT) return bad(`Keep the CTA under ${CTA_LIMIT} characters.`);
        update.cta_text = s || null;
      }
      if ("destination_url" in body) {
        const v = body.destination_url;
        if (v === null || v === "") update.destination_url = null;
        else if (typeof v !== "string" || !isHttpUrl(v.trim())) {
          return bad("The destination link must be a full web address, starting with https://");
        } else update.destination_url = v.trim();
      }
      if (Object.keys(update).length) {
        await admin.from("spark_series").update(update).eq("id", series.id).eq("user_id", userId);
      }
      return NextResponse.json({ ok: true });
    }

    // ── Running order ────────────────────────────────────────────────────────
    case "reorder": {
      const series = await ownedSeries(admin, userId, body.seriesId);
      if (!series) return NextResponse.json({ error: "Series not found." }, { status: 404 });
      const order = Array.isArray(body.order) ? body.order.filter((x): x is string => typeof x === "string") : [];
      if (!order.length) return bad("No order given.");
      for (let i = 0; i < order.length; i++) {
        await admin
          .from("campaigns")
          .update({ series_position: i })
          .eq("id", order[i])
          .eq("user_id", userId)
          .eq("series_id", series.id);
      }
      return NextResponse.json({ ok: true });
    }

    // ── A planned Spark: a name and nothing else yet ─────────────────────────
    case "plan": {
      const series = await ownedSeries(admin, userId, body.seriesId);
      if (!series) return NextResponse.json({ error: "Series not found." }, { status: 404 });
      const name = cleanName(body.name);
      if (!name) return bad("Give the Spark a name.");
      const { data, error } = await admin
        .from("campaigns")
        .insert({
          user_id: userId,
          name,
          blog_title: name,
          series_id: series.id,
          series_position: await nextPosition(admin, userId, series.id),
        })
        .select("id")
        .single();
      if (error) return NextResponse.json({ error: "Couldn't add the Spark." }, { status: 500 });
      return NextResponse.json({ ok: true, sparkId: (data as { id: string } | null)?.id });
    }

    // ── Move a Spark in, or out ──────────────────────────────────────────────
    case "move": {
      const sparkId = typeof body.sparkId === "string" ? body.sparkId : "";
      if (!sparkId) return bad("sparkId required.");
      const { data: sparkRow } = await admin
        .from("campaigns")
        .select("id, series_id")
        .eq("id", sparkId)
        .eq("user_id", userId)
        .maybeSingle();
      const spark = sparkRow as { id: string; series_id: string | null } | null;
      if (!spark) return NextResponse.json({ error: "Spark not found." }, { status: 404 });

      // Leaving its old Series: keep whatever it was inheriting.
      if (spark.series_id && spark.series_id !== body.seriesId) {
        const from = await ownedSeries(admin, userId, spark.series_id);
        if (from) await keepInherited(admin, userId, from, [spark.id]);
      }

      if (body.seriesId === null) {
        await admin
          .from("campaigns")
          .update({ series_id: null, series_position: null })
          .eq("id", sparkId)
          .eq("user_id", userId);
        return NextResponse.json({ ok: true });
      }

      const target = await ownedSeries(admin, userId, body.seriesId);
      if (!target) return NextResponse.json({ error: "Series not found." }, { status: 404 });
      await admin
        .from("campaigns")
        .update({ series_id: target.id, series_position: await nextPosition(admin, userId, target.id) })
        .eq("id", sparkId)
        .eq("user_id", userId);
      return NextResponse.json({ ok: true });
    }

    // ── Delete the Series, keep the Sparks ───────────────────────────────────
    case "delete": {
      const series = await ownedSeries(admin, userId, body.seriesId);
      if (!series) return NextResponse.json({ error: "Series not found." }, { status: 404 });
      await keepInherited(admin, userId, series);
      // The foreign key clears series_id on every Spark that was in it.
      await admin.from("spark_series").delete().eq("id", series.id).eq("user_id", userId);
      await admin
        .from("campaigns")
        .update({ series_position: null })
        .eq("user_id", userId)
        .is("series_id", null)
        .not("series_position", "is", null);
      return NextResponse.json({ ok: true });
    }

    default:
      return bad("Unknown action.");
  }
}
