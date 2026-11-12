import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptToken, decryptToken } from "@/lib/crypto/tokens";
import { openaiChatJson } from "@/lib/api/openai-chat";
import { chatJson } from "@/lib/api/perplexity-chat";
import { PLAIN_COPY_RULES, plainCopy } from "@/lib/utils/copy-style";
import { FAIR_HOUSING_GUARDRAIL } from "@/lib/utils/fair-housing";
import { loadAgentSignature } from "@/lib/utils/agent-signature";
import { FONT, INK, MUTED, esc, emailButton, emailShell, emailSignatureHtml, emailSignatureText, type EmailSignature } from "@/lib/utils/email-html";
import { videoBlock, greetingName, type SellerVideo } from "@/lib/utils/newsletter-html";
import { emailPosterFor } from "@/lib/video/email-poster";
import { loadBoldTrailToken, findOrCreateContact, sendBoldTrailEmail } from "@/lib/api/boldtrail";
import { sendAgentEmailViaSparkReels } from "@/lib/email";
import { makeDraftVideo } from "@/lib/halo/make";
import { sparkleeSetup } from "@/lib/halo/sparklee";
import { HALO_PROFILE_SELECT, type HaloProfile, type HaloSetup } from "@/lib/halo";
import { parseHaloLink } from "@/lib/halo/get-halo";
import { mondayFor, zoneOf } from "@/lib/autopilot";
import { addSparkleeNote } from "@/lib/sparklee-notes";

/**
 * Halo leads (2026-11-09, the owner's approved mockup).
 *
 * Halo's "Send to my CRM → Custom webhook" posts every new lead to the agent's
 * own link (/api/halo/leads/<token>). Halo keeps the lead itself: calling,
 * texting and its status stay in Halo. SparkReels adds the video reply:
 *
 * - A buyer or seller lead: a welcome email is written and (by default) a
 *   short Avatar in circle video made straight away.
 * - A business form (a spotlight or listing request on a community site):
 *   waits for the agent to make a spotlight video, record one, or send the
 *   email alone. The email introduces Halo and SparkReels as separate tools.
 *
 * Nothing is sent until the agent presses Approve on AutoSparks. The agent's
 * own notes on the lead in Halo are never stored.
 */

type Admin = SupabaseClient;

export interface HaloLeadSettings {
  enabled: boolean;
  /** Nothing is made on its own (2026-11-09): On just means a card appears. */
  buyer: "on" | "off";
  business: "on" | "off";
  /** The agent's Halo page or code, for the business email's Halo button. */
  haloLink: string | null;
  /** Their booking page, for "grab 20 minutes" in the business email. */
  bookingUrl: string | null;
  lastTestAt: string | null;
  lastLeadAt: string | null;
}

export const HALO_LEAD_DEFAULTS: HaloLeadSettings = {
  enabled: true, buyer: "on", business: "on", haloLink: null, bookingUrl: null, lastTestAt: null, lastLeadAt: null,
};

const httpsUrl = (v: unknown): string | null => {
  if (typeof v !== "string" || !v.trim()) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(v.trim()) ? v.trim() : `https://${v.trim()}`);
    u.protocol = "https:";
    return u.toString();
  } catch { return null; }
};

export function sanitizeLeadSettings(raw: unknown): HaloLeadSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = HALO_LEAD_DEFAULTS;
  const halo = typeof r.haloLink === "string" && r.haloLink.trim() ? parseHaloLink(r.haloLink) : null;
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : d.enabled,
    buyer: r.buyer === "off" ? "off" : "on",
    business: r.business === "off" ? "off" : "on",
    haloLink: halo && !("error" in halo) ? (halo.kind === "url" ? halo.url : halo.code) : null,
    bookingUrl: httpsUrl(r.bookingUrl),
    lastTestAt: typeof r.lastTestAt === "string" ? r.lastTestAt : null,
    lastLeadAt: typeof r.lastLeadAt === "string" ? r.lastLeadAt : null,
  };
}

/** The agent's link and secret, made the first time they're asked for. */
export async function ensureLeadLink(admin: Admin, userId: string): Promise<{ token: string; secret: string }> {
  const { data } = await admin.from("profiles").select("halo_leads_token, halo_leads_secret_enc").eq("id", userId).single();
  const p = data as { halo_leads_token: string | null; halo_leads_secret_enc: string | null } | null;
  const secret = decryptToken(p?.halo_leads_secret_enc);
  if (p?.halo_leads_token && secret) return { token: p.halo_leads_token, secret };
  const token = p?.halo_leads_token || randomBytes(12).toString("hex");
  const fresh = secret || randomBytes(24).toString("hex");
  await admin.from("profiles").update({ halo_leads_token: token, halo_leads_secret_enc: encryptToken(fresh) }).eq("id", userId);
  return { token, secret: fresh };
}

/** Halo's X-Halo-Signature: HMAC-SHA256 of the body, as hex (with or without "sha256=") or base64. */
export function signatureMatches(body: string, secret: string, header: string): boolean {
  const mac = createHmac("sha256", secret).update(body).digest();
  const given = header.trim().replace(/^sha256=/i, "");
  for (const want of [mac.toString("hex"), mac.toString("base64")]) {
    const a = Buffer.from(want);
    const b = Buffer.from(given);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

// ── What Halo sends ────────────────────────────────────────────────────────

export interface LeadFields {
  name: string | null; email: string | null; phone: string | null;
  site: string | null; siteUrl: string | null; page: string | null; form: string | null;
  summary: string | null; businessName: string | null; town: string | null;
  website: string | null; category: string | null; message: string | null; leadLink: string | null;
  filtered: boolean; test: boolean;
}

const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");
/** The agent's private notes on the lead never come across. */
const PRIVATE = new Set(["notes", "note", "agentnotes", "internalnotes"]);

/** Every value in the payload, keyed by its own name and its full path, nested or not. */
function flatten(v: unknown, path = "", out = new Map<string, unknown>(), depth = 0): Map<string, unknown> {
  if (depth > 4 || v === null || v === undefined) return out;
  if (Array.isArray(v)) {
    // Halo-style field lists: [{ name|label|key, value }]
    for (const item of v) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const o = item as Record<string, unknown>;
        const label = o.name ?? o.label ?? o.key ?? o.field;
        if (typeof label === "string" && ("value" in o)) {
          const k = norm(label);
          if (!PRIVATE.has(k) && !out.has(k)) out.set(k, o.value);
          continue;
        }
      }
      flatten(item, path, out, depth + 1);
    }
    return out;
  }
  if (typeof v === "object") {
    for (const [key, val] of Object.entries(v as Record<string, unknown>)) {
      const k = norm(key);
      if (PRIVATE.has(k)) continue;
      const full = norm(`${path}${key}`);
      if (val !== null && typeof val === "object") flatten(val, `${path}${key}_`, out, depth + 1);
      else {
        if (!out.has(k)) out.set(k, val);
        if (!out.has(full)) out.set(full, val);
      }
    }
  }
  return out;
}

/** The payload as stored: the same, minus the agent's notes. */
export function withoutNotes(v: unknown, depth = 0): unknown {
  if (depth > 6 || v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map((x) => withoutNotes(x, depth + 1))
    .filter((x) => !(x && typeof x === "object" && PRIVATE.has(norm(String((x as Record<string, unknown>).name ?? (x as Record<string, unknown>).label ?? "")))));
  return Object.fromEntries(Object.entries(v as Record<string, unknown>)
    .filter(([k]) => !PRIVATE.has(norm(k)))
    .map(([k, val]) => [k, withoutNotes(val, depth + 1)]));
}

export function readLead(payload: unknown): LeadFields {
  const f = flatten(payload);
  const pick = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = f.get(k);
      if (typeof v === "string" && v.trim()) return v.trim();
      if (typeof v === "number") return String(v);
    }
    return null;
  };
  const first = pick("firstname", "rawfirstname");
  const last = pick("lastname", "rawlastname");
  const email = pick("email", "rawemail", "contactemail", "leademail", "emailaddress");
  const phone = pick("phone", "rawphone", "contactphone", "mobile", "phonenumber");
  const website = pick("website", "rawwebsite", "businesswebsite");
  const event = (pick("event", "type", "eventtype") ?? "").toLowerCase();
  const filtered = pick("filteredas", "filtered", "spam", "filterreason");
  return {
    name: pick("name", "rawname", "fullname", "contactname", "leadname") ?? ([first, last].filter(Boolean).join(" ") || null),
    email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.toLowerCase() : null,
    phone: phone ? phone.replace(/^'+/, "").trim() : null,
    site: pick("site", "sitename", "sitedomain", "domain"),
    siteUrl: httpsUrl(pick("siteurl", "sitelink")),
    page: pick("page", "pageurl", "pagepath"),
    form: pick("form", "formname", "formtype", "formid"),
    summary: pick("summary", "aisummary"),
    businessName: pick("businessname", "rawbusinessname", "company", "companyname", "rawcompany"),
    town: pick("town", "rawtown", "city", "rawcity"),
    website: website ? httpsUrl(website.replace(/^https?\.\/\//i, "https://")) : null,
    category: pick("category", "rawcategory", "businesscategory"),
    message: pick("message", "rawmessage", "comments", "comment", "inquiry", "body"),
    leadLink: httpsUrl(pick("leadlink", "leadurl", "link", "url")),
    filtered: !!filtered && !/^(no|false|none|0)$/i.test(filtered),
    test: event.includes("test") || f.get("test") === true || f.get("istest") === true,
  };
}

/** A business form (spotlight, listing, sponsor) rather than a buyer or seller. */
export const isBusinessLead = (l: Pick<LeadFields, "form" | "businessName" | "category">) =>
  /business|spotlight|sponsor|vendor|partner|directory/i.test(l.form ?? "") || (!!l.businessName && !!l.category);

const isRealEstate = (l: { category: string | null; message: string | null; business_name?: string | null }) =>
  /real\s*estate|realt|broker|homes?\b/i.test(`${l.category ?? ""} ${l.business_name ?? ""}`);

// ── Rows ───────────────────────────────────────────────────────────────────

export interface LeadRow {
  id: string; user_id: string; kind: "buyer" | "business";
  name: string | null; email: string | null; phone: string | null;
  site: string | null; site_url: string | null; page: string | null; forms: string[];
  summary: string | null; business_name: string | null; town: string | null;
  website: string | null; category: string | null; message: string | null; lead_link: string | null;
  status: "new" | "writing" | "written" | "making" | "camera" | "ready" | "sending" | "sent" | "skipped" | "failed";
  mode: "video" | "camera" | "email" | "saved" | null; script: string | null;
  email_draft: LeadEmail | null; project_id: string | null; video_id: string | null;
  camera_since: string | null; halo_draft_id: string | null; error: string | null;
  sent_at: string | null; sent_via: string | null; received_at: string;
}
export const LEAD_COLS = "id, user_id, kind, name, email, phone, site, site_url, page, forms, summary, business_name, town, website, category, message, lead_link, status, mode, script, email_draft, project_id, video_id, camera_since, halo_draft_id, error, sent_at, sent_via, received_at";

/** The email as written, all of it editable on the card except the two tool boxes. */
export interface LeadEmail {
  subject: string;
  /** Greeting and the personal lines. */
  note: string;
  /** The line about the video, shown only when there is one. */
  videoLine: string;
  /** Business emails: the line before the Halo and SparkReels boxes, the boxes, then `after`. */
  tools: boolean;
  toolsIntro: string;
  after: string;
  /** Spotlights: the post caption for the video, not shown in the email. */
  caption?: string;
}

/**
 * Saves a lead from Halo. Two forms from one person within the hour become
 * one lead (Jennifer's spotlight and listing forms came four minutes apart).
 */
export async function saveLead(admin: Admin, userId: string, l: LeadFields, raw: unknown): Promise<{ lead: LeadRow; merged: boolean }> {
  const kind: LeadRow["kind"] = isBusinessLead(l) ? "business" : "buyer";
  if (l.email) {
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { data: same } = await admin.from("halo_leads").select(LEAD_COLS)
      .eq("user_id", userId).ilike("email", l.email.replace(/[\\%_]/g, (c) => "\\" + c)).gte("received_at", since)
      .in("status", ["new", "writing", "written", "making", "camera", "ready", "failed"])
      .order("received_at", { ascending: false }).limit(1).maybeSingle();
    const s = same as LeadRow | null;
    if (s) {
      const longer = (a: string | null, b: string | null) => ((b ?? "").length > (a ?? "").length ? b : a);
      const patch = {
        name: s.name ?? l.name, phone: s.phone ?? l.phone, site: s.site ?? l.site, site_url: s.site_url ?? l.siteUrl,
        page: s.page ?? l.page, summary: longer(s.summary, l.summary), business_name: longer(s.business_name, l.businessName),
        town: s.town ?? l.town, website: s.website ?? l.website, category: s.category ?? l.category,
        message: longer(s.message, l.message), lead_link: s.lead_link ?? l.leadLink,
        forms: Array.from(new Set([...(s.forms ?? []), ...(l.form ? [l.form] : [])])),
        updated_at: new Date().toISOString(),
      };
      const { data } = await admin.from("halo_leads").update(patch).eq("id", s.id).select(LEAD_COLS).single();
      return { lead: (data ?? { ...s, ...patch }) as LeadRow, merged: true };
    }
  }
  const { data, error } = await admin.from("halo_leads").insert({
    user_id: userId, kind, name: l.name, email: l.email, phone: l.phone, site: l.site, site_url: l.siteUrl,
    page: l.page, forms: l.form ? [l.form] : [], summary: l.summary, business_name: l.businessName, town: l.town,
    website: l.website, category: l.category, message: l.message, lead_link: l.leadLink,
    raw: withoutNotes(raw) ?? {},
  }).select(LEAD_COLS).single();
  if (error || !data) throw new Error(error?.message ?? "insert failed");
  return { lead: data as LeadRow, merged: false };
}

// ── Writing ────────────────────────────────────────────────────────────────

const SYSTEM = `You write short, warm messages for a real estate agent replying to someone who filled in a form on the agent's website. Return only valid JSON.

FACTS RULE: Use only the facts given. Never invent a detail about the person, their business, a home, a price, a date or a promise. If something isn't given, leave it out. Do not search the web.

${PLAIN_COPY_RULES}

${FAIR_HOUSING_GUARDRAIL}`;

async function ask(prompt: string, label: string): Promise<Record<string, unknown> | null> {
  const turns = [{ role: "user" as const, content: prompt }];
  return (await openaiChatJson(SYSTEM, turns, { maxTokens: 1600, label }))
    ?? (await chatJson(SYSTEM, turns, { maxTokens: 900, label }));
}

function leadFacts(l: LeadRow, agent: string | null): string {
  return [
    `AGENT: ${agent || "(name not given)"}`,
    `THEIR NAME: ${l.name || "(not given)"}`,
    l.business_name && `THEIR BUSINESS: ${l.business_name}`,
    l.category && `CATEGORY: ${l.category}`,
    l.town && `TOWN: ${l.town}`,
    l.website && `THEIR WEBSITE: ${l.website}`,
    `CAME FROM: ${l.site || "the agent's website"}${l.forms.length ? ` (form: ${l.forms.join(", ")})` : ""}`,
    l.summary && `SUMMARY: ${l.summary}`,
    `WHAT THEY WROTE:\n"""\n${(l.message || "(nothing)").slice(0, 2500)}\n"""`,
  ].filter(Boolean).join("\n");
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const firstOf = (l: LeadRow) => greetingName(l.name) || "there";

interface Written { email: LeadEmail; script: string; description: string }

async function writeBuyer(l: LeadRow, agent: string | null): Promise<Written | null> {
  const d = await ask(`Write ${agent || "the agent"}'s first reply to a new lead, as an email and a short video script.

${leadFacts(l, agent)}

Email: 2 or 3 short paragraphs, no greeting and no sign-off (both are added), and don't mention a video. Thank them for reaching out through ${l.site || "the website"}, show you read what they asked, say what happens next, and invite a reply or a call. 50 to 110 words.
Video script: what the agent says on camera, 70 to 110 words, about 30 to 45 seconds. Greet them by first name, thank them, speak to what they asked, say what happens next, warm sign-off. Natural spoken sentences, no lists, no stage directions.

Return ONLY this JSON:
{ "subject": "under 60 characters, friendly, e.g. 'Thanks for reaching out, Maria'", "paragraphs": ["..."], "script": "..." }`, "halo-lead-buyer");
  if (!d) return null;
  const paras = (Array.isArray(d.paragraphs) ? d.paragraphs : []).map((p) => plainCopy(String(p))).filter(Boolean).slice(0, 3);
  const script = plainCopy(String(d.script ?? ""));
  if (!paras.length || words(script) < 30) return null;
  const subject = plainCopy(String(d.subject ?? "")).replace(/[.]$/, "").slice(0, 90) || "Thanks for reaching out";
  return {
    email: {
      subject, note: [`Hi ${firstOf(l)},`, ...paras].join("\n\n"),
      videoLine: "I made you a quick video too. Take a look below.",
      tools: false, toolsIntro: "", after: "",
    },
    script, description: "",
  };
}

async function writeBusiness(l: LeadRow, agent: string | null, s: HaloLeadSettings): Promise<Written | null> {
  const biz = l.business_name || l.name || "your business";
  const d = await ask(`${l.name || "Someone"} asked to be featured on ${agent || "the agent"}'s community site, ${l.site || "their website"}.

${leadFacts(l, agent)}

1. "personal": one or two warm sentences reacting to something specific they wrote. No greeting, no sign-off, no mention of tools, websites or a video.
2. "script": what ${agent || "the agent"} says on camera in a 40 to 60 second spotlight of ${biz}, 100 to 140 words. Open with "${l.town ? `Here in ${l.town}` : "Today"}" or the business name, say who they are and what makes them special using only what they wrote, and end by inviting viewers to check them out${l.website ? " at their website" : ""}. Natural spoken sentences, no lists, no stage directions, no prices or claims they didn't make.
3. "description": a 1 to 2 sentence post caption for the spotlight video.

Return ONLY this JSON:
{ "personal": "...", "script": "...", "description": "..." }`, "halo-lead-business");
  if (!d) return null;
  const personal = plainCopy(String(d.personal ?? ""));
  const script = plainCopy(String(d.script ?? ""));
  if (!personal || words(script) < 40) return null;

  const after = [
    "Use Halo if you mainly want to be found when people search or ask AI. Use SparkReels if you want steady videos and posts without filming every week. Use them together and your new videos keep your Halo site fresh, which helps you show up even more.",
    s.bookingUrl
      ? `I'd love to walk you through either one. You can grab 20 minutes with me here: ${s.bookingUrl}`
      : "I'd love to walk you through either one. Just reply to this email and we'll find a time.",
    "Warm regards,",
  ].join("\n\n");
  return {
    email: {
      subject: `A spotlight video for ${biz}`,
      note: [`Hi ${firstOf(l)},`, `It was great to see your note come through on ${l.site || "my site"}. ${personal}`].join("\n\n"),
      videoLine: `I made you a short spotlight video about ${biz}. Take a look below.`,
      tools: true,
      toolsIntro: `Two tools I use myself could help ${biz} get found and stay in front of people. They work on their own, so you don't need both:`,
      after,
    },
    script, description: plainCopy(String(d.description ?? "")),
  };
}

// ── Links in the business email ────────────────────────────────────────────

export async function leadLinks(admin: Admin, userId: string, s: HaloLeadSettings): Promise<{ halo: string; sparkreels: string }> {
  const { data } = await admin.from("affiliates").select("ref_code, halo_link").eq("user_id", userId).eq("status", "approved").limit(1).maybeSingle();
  const a = data as { ref_code: string | null; halo_link: string | null } | null;
  const asUrl = (link: string | null): string | null => {
    if (!link) return null;
    const p = parseHaloLink(link);
    if ("error" in p) return null;
    return p.kind === "url" ? p.url : `https://huzihalo.com/subscribe?affiliate=${encodeURIComponent(p.code)}`;
  };
  return {
    halo: asUrl(s.haloLink) ?? asUrl(a?.halo_link ?? null) ?? "https://huzihalo.com",
    sparkreels: a?.ref_code ? `https://www.sparkreels.ai/?ref=${encodeURIComponent(a.ref_code)}` : "https://www.sparkreels.ai",
  };
}

function toolText(l: LeadRow, madeWithAvatar: boolean) {
  const town = l.town || "your area";
  const re = isRealEstate(l);
  return {
    halo: re
      ? `Halo builds AI-ready listing websites and walkthrough videos for your properties, plus a personal brand site that gets found when buyers and sellers ask AI who to work with in ${town}.`
      : `Halo builds an AI-ready website for your business, so you get found when people search or ask AI who to call in ${town}.`,
    sparkreels: (re
      ? "SparkReels turns what you say into market videos, blog posts and social posts with your own AI avatar, so you show up every week without filming."
      : "SparkReels turns what you say into short videos, blog posts and social posts with your own AI avatar, so you show up every week without filming.")
      + (madeWithAvatar ? " The video above was made with it." : ""),
  };
}

// ── The email ──────────────────────────────────────────────────────────────

/** A paragraph with its web addresses clickable. */
const linkedP = (text: string) =>
  `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.6;color:${INK};">${esc(text)
    .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, (u) => `<a href="${u}" style="color:#A3660F;">${u}</a>`)}</p>`;
const paras = (s: string | undefined) => (s ?? "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

function toolBox(name: string, text: string, url: string, label: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;border:1px solid #e2e8f0;border-radius:10px;"><tr><td style="padding:16px 18px 2px;">
<p style="margin:0 0 6px;font-family:${FONT};font-size:17px;font-weight:bold;color:${INK};">${esc(name)}</p>
<p style="margin:0 0 4px;font-family:${FONT};font-size:15px;line-height:1.55;color:${MUTED};">${esc(text)}</p>
${emailButton(url, label, "10px 0 14px")}
</td></tr></table>`;
}

type EmailOpts = { video: SellerVideo | null; signature: EmailSignature; links: { halo: string; sparkreels: string }; madeWithAvatar: boolean };

export function leadEmailHtml(l: LeadRow, e: LeadEmail, opts: EmailOpts): string {
  const t = toolText(l, opts.madeWithAvatar);
  const top = [...paras(e.note), ...(opts.video ? paras(e.videoLine) : [])];
  return emailShell({
    title: e.subject,
    preview: top[1] ?? top[0] ?? e.subject,
    inner: `<tr><td style="padding:28px 24px 24px;">
${top.map(linkedP).join("\n")}
${opts.video ? videoBlock(opts.video, "Watch the video") : ""}
${e.tools ? paras(e.toolsIntro).map(linkedP).join("\n") + toolBox("Halo", t.halo, opts.links.halo, "See Halo") + toolBox("SparkReels", t.sparkreels, opts.links.sparkreels, "See SparkReels") : ""}
${paras(e.after).map(linkedP).join("\n")}
${emailSignatureHtml(opts.signature)}
</td></tr>`,
  });
}

export function leadEmailText(l: LeadRow, e: LeadEmail, opts: EmailOpts): string {
  const t = toolText(l, opts.madeWithAvatar);
  return [
    e.note, "",
    ...(opts.video ? [e.videoLine, `Watch the video: ${opts.video.url}`, ""] : []),
    ...(e.tools ? [e.toolsIntro, "", `Halo: ${t.halo}`, opts.links.halo, "", `SparkReels: ${t.sparkreels}`, opts.links.sparkreels, ""] : []),
    e.after, "",
    ...emailSignatureText(opts.signature),
  ].join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ── Writing, then choosing who says it ─────────────────────────────────────

async function settingsFor(admin: Admin, userId: string): Promise<HaloLeadSettings> {
  const { data } = await admin.from("profiles").select("halo_leads").eq("id", userId).single();
  return sanitizeLeadSettings((data as { halo_leads: unknown } | null)?.halo_leads);
}

/** Write it: the email and the video script. Free; nothing is made. */
export async function writeLead(admin: Admin, userId: string, l: LeadRow): Promise<{ status: number; out: Record<string, unknown> }> {
  await admin.from("halo_leads").update({ status: "writing", error: null, updated_at: new Date().toISOString() }).eq("id", l.id);
  const signature = await loadAgentSignature(admin, userId);
  const s = await settingsFor(admin, userId);
  const w = l.kind === "business" ? await writeBusiness(l, signature.name ?? null, s) : await writeBuyer(l, signature.name ?? null);
  if (!w) {
    await admin.from("halo_leads").update({ status: l.email_draft ? "written" : "failed", error: "Couldn't write it. Try again." }).eq("id", l.id);
    return { status: 502, out: { error: "Couldn't write it. Try again." } };
  }
  await admin.from("halo_leads").update({
    status: "written", mode: null, email_draft: { ...w.email, ...(w.description && { caption: w.description }) }, script: w.script, project_id: null, video_id: null,
    error: null, updated_at: new Date().toISOString(),
  }).eq("id", l.id);
  return { status: 200, out: { ok: true, status: "written" } };
}

/**
 * Who says it: Avatar video (uses 1 short video), Me on camera (the script in
 * the teleprompter; the take comes back to the card), or Email only.
 */
/**
 * The subject and video line for the choice made, unless the agent changed
 * them. Each choice has its own wording; only a line still on one of those
 * is swapped, so anything typed in Edit email stays.
 */
function emailForChoice(l: LeadRow, email: LeadEmail, mode: "video" | "camera" | "email" | "saved"): LeadEmail {
  const biz = l.business_name || l.name || "your business";
  const re = isRealEstate(l);
  if (l.kind === "business") {
    const subjects = {
      video: `A spotlight video for ${biz}`,
      plain: `An idea for ${biz}`,
      // A saved video for another agent is about the tools, not a spotlight (2026-11-11).
      saved: re ? `SparkReels and Halo for ${biz}` : `An idea for ${biz}`,
    };
    const lines = {
      video: `I made you a short spotlight video about ${biz}. Take a look below.`,
      camera: `I recorded a short spotlight video about ${biz}. Take a look below.`,
      saved: re
        ? "Here's a short video on how SparkReels and Halo work for agents."
        : "Here's a short video I think you'll like. Take a look below.",
    };
    const subject = mode === "email" ? subjects.plain : mode === "saved" ? subjects.saved : subjects.video;
    const line = mode === "email" ? null : lines[mode];
    return {
      ...email,
      ...(Object.values(subjects).includes(email.subject) && { subject }),
      ...(line && Object.values(lines).includes(email.videoLine) && { videoLine: line }),
    };
  }
  const lines = {
    made: "I made you a quick video too. Take a look below.",
    saved: "Here's a short video I think you'll find helpful. Take a look below.",
  };
  if (mode === "email" || !Object.values(lines).includes(email.videoLine)) return email;
  return { ...email, videoLine: mode === "saved" ? lines.saved : lines.made };
}

export async function chooseLead(
  admin: Admin,
  user: { id: string; email: string | null },
  l: LeadRow,
  mode: "video" | "camera" | "email",
  script?: string,
): Promise<{ status: number; out: Record<string, unknown> }> {
  if (!l.email_draft) return { status: 400, out: { error: "Press Write it first." } };
  const words2 = (script ?? l.script ?? "").replace(/\s+/g, " ").trim().slice(0, 2500);
  const now = new Date().toISOString();
  const biz = l.business_name || l.name || "your business";
  const email = emailForChoice(l, l.email_draft, mode);

  if (mode === "email") {
    await admin.from("halo_leads").update({ status: "ready", mode, email_draft: email, script: words2 || l.script, project_id: null, video_id: null, error: null, updated_at: now }).eq("id", l.id);
    return { status: 200, out: { ok: true, status: "ready" } };
  }
  if (words(words2) < 15) return { status: 400, out: { error: "Write a few sentences for the video first." } };
  if (mode === "camera") {
    await admin.from("halo_leads").update({ status: "camera", mode, email_draft: email, script: words2, camera_since: now, video_id: null, error: null, updated_at: now }).eq("id", l.id);
    return { status: 200, out: { ok: true, status: "camera", script: words2 } };
  }
  if (words(words2) > 220) return { status: 400, out: { error: `Keep it under about a minute and a half: 220 words at most. It's ${words(words2)} now.` } };

  const title = l.kind === "business" ? `Spotlight: ${biz}` : `Welcome video: ${l.name || "new lead"}`;
  const { data: project, error } = await admin.from("projects").insert({
    user_id: user.id, title, project_type: "location_script", status: "draft",
    ...(l.town && { location_city: l.town }),
    ai_script: {
      title, hook: "", script: words2, cta: "", description: l.kind === "business" ? (email.caption ?? "") : "",
      hashtags: [], kind: l.kind === "business" ? "halo_spotlight" : "halo_welcome",
    },
  }).select("id").single();
  if (error || !project) return { status: 500, out: { error: "Couldn't start the video. Try again." } };
  const projectId = (project as { id: string }).id;

  // A welcome video is a short Avatar in circle, like a seller update. A
  // spotlight uses the agent's Halo look and size, since it's posted too.
  let setup: HaloSetup = {
    look: "circle", lookId: null, size: "horizontal", picture: "ai", pictureUrl: null,
    onScreen: "stock", photos: [], platforms: [], captions: true, music: "none",
  };
  if (l.kind === "business") {
    const { data: prof } = await admin.from("profiles").select(HALO_PROFILE_SELECT).eq("id", user.id).single();
    if (prof) setup = (await sparkleeSetup(admin, user.id, prof as unknown as HaloProfile, { words: "tomorrow" })).setup;
  }
  const made = await makeDraftVideo(admin, user, { id: l.id, project_id: projectId, setup });
  if (made.status >= 400) {
    const why = typeof made.out.error === "string" ? made.out.error : "Couldn't start the video.";
    await admin.from("halo_leads").update({ email_draft: email, script: words2, status: "written", error: why }).eq("id", l.id);
    return { status: made.status, out: made.out };
  }
  await admin.from("halo_leads").update({ status: "making", mode, email_draft: email, script: words2, project_id: projectId, video_id: null, error: null, updated_at: now }).eq("id", l.id);
  return { status: 200, out: { ok: true, status: "making" } };
}

/**
 * Saved video (2026-11-11, the owner's approved mockup): one of the agent's
 * finished videos goes with the email instead of a new one, so the same
 * video can answer every lead it fits. Uses no video from the plan, and is
 * never added to the Halo drafts (that is only for a spotlight made for them).
 */
export async function chooseSavedVideo(
  admin: Admin,
  userId: string,
  l: LeadRow,
  videoId: string,
): Promise<{ status: number; out: Record<string, unknown> }> {
  if (!l.email_draft) return { status: 400, out: { error: "Press Write it first." } };
  const { data } = await admin.from("generated_videos").select("id")
    .eq("id", videoId).eq("user_id", userId).eq("render_status", "completed").not("video_url", "is", null).maybeSingle();
  if (!data) return { status: 404, out: { error: "That video isn't available. Pick another." } };
  const email = emailForChoice(l, l.email_draft, "saved");
  await admin.from("halo_leads").update({
    status: "ready", mode: "saved", email_draft: email, video_id: videoId,
    project_id: null, camera_since: null, error: null, updated_at: new Date().toISOString(),
  }).eq("id", l.id);
  return { status: 200, out: { ok: true, status: "ready" } };
}

export interface SavedVideo { id: string; title: string; seconds: number | null; createdAt: string; thumbnail: string | null; lastUsed: boolean }

/** The agent's finished videos for the picker, the one used last on top. */
export async function savedVideos(admin: Admin, userId: string): Promise<SavedVideo[]> {
  const [{ data: vids }, { data: last }] = await Promise.all([
    admin.from("generated_videos")
      .select("id, duration_seconds, created_at, metadata, projects(title, thumbnail_url)")
      .eq("user_id", userId).eq("render_status", "completed").not("video_url", "is", null)
      .order("created_at", { ascending: false }).limit(60),
    admin.from("halo_leads").select("video_id")
      .eq("user_id", userId).eq("mode", "saved").not("video_id", "is", null)
      .order("updated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const lastId = (last as { video_id: string | null } | null)?.video_id ?? null;
  type Row = { id: string; duration_seconds: number | null; created_at: string; metadata: Record<string, unknown> | null; projects: { title: string | null; thumbnail_url: string | null } | { title: string | null; thumbnail_url: string | null }[] | null };
  const list = ((vids ?? []) as unknown as Row[]).map((v): SavedVideo => {
    const p = Array.isArray(v.projects) ? v.projects[0] : v.projects;
    const metaTitle = typeof v.metadata?.title === "string" ? (v.metadata.title as string) : null;
    return {
      id: v.id, title: (p?.title || metaTitle || "Untitled video").slice(0, 120),
      seconds: v.duration_seconds, createdAt: v.created_at, thumbnail: p?.thumbnail_url ?? null, lastUsed: v.id === lastId,
    };
  });
  return [...list.filter((v) => v.lastUsed), ...list.filter((v) => !v.lastUsed)];
}

/** A video being made or recorded: finished yet? Updates the lead when it is. */
export async function refreshLead(admin: Admin, l: LeadRow): Promise<LeadRow> {
  if (l.status === "making" && l.project_id) {
    const { data } = await admin.from("generated_videos").select("id, render_status, video_url")
      .eq("project_id", l.project_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const v = data as { id: string; render_status: string | null; video_url: string | null } | null;
    if (v?.render_status === "completed" && v.video_url) {
      await admin.from("halo_leads").update({ status: "ready", video_id: v.id }).eq("id", l.id);
      return { ...l, status: "ready", video_id: v.id };
    }
    if (v?.render_status === "failed") {
      const error = "The video didn't finish. Try again, record it yourself, or send the email alone.";
      await admin.from("halo_leads").update({ status: "written", error }).eq("id", l.id);
      return { ...l, status: "written", error };
    }
  }
  if (l.status === "camera" && l.camera_since) {
    // The newest finished video since Me on camera was pressed.
    const { data } = await admin.from("generated_videos").select("id, video_url")
      .eq("user_id", l.user_id).eq("render_status", "completed").not("video_url", "is", null)
      .gt("created_at", l.camera_since).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const v = data as { id: string } | null;
    if (v) {
      await admin.from("halo_leads").update({ status: "ready", video_id: v.id }).eq("id", l.id);
      return { ...l, status: "ready", video_id: v.id };
    }
  }
  return l;
}

/** The lead's video for the card and the email. */
export async function leadVideo(admin: Admin, l: LeadRow): Promise<{ id: string; url: string; seconds: number | null; email_poster_url: string | null; project_id: string | null; thumbnail: string | null; title: string | null } | null> {
  if (!l.video_id) return null;
  const { data } = await admin.from("generated_videos")
    .select("id, video_url, duration_seconds, email_poster_url, project_id, projects(thumbnail_url, title)")
    .eq("id", l.video_id).maybeSingle();
  const v = data as unknown as { id: string; video_url: string | null; duration_seconds: number | null; email_poster_url: string | null; project_id: string | null; projects: { thumbnail_url: string | null; title: string | null } | { thumbnail_url: string | null; title: string | null }[] | null } | null;
  if (!v?.video_url) return null;
  const proj = Array.isArray(v.projects) ? v.projects[0] : v.projects;
  return { id: v.id, url: v.video_url, seconds: v.duration_seconds, email_poster_url: v.email_poster_url, project_id: v.project_id, thumbnail: proj?.thumbnail_url ?? null, title: proj?.title ?? null };
}

/** Builds the email exactly as it will go, for the card's preview and the send. */
export async function buildLeadEmail(admin: Admin, userId: string, l: LeadRow) {
  if (!l.email_draft) return null;
  const [signature, s, v] = await Promise.all([loadAgentSignature(admin, userId), settingsFor(admin, userId), l.mode === "email" ? null : leadVideo(admin, l)]);
  const links = await leadLinks(admin, userId, s);
  const posterUrl = v ? await emailPosterFor(admin, userId, { id: v.id, video_url: v.url, duration_seconds: v.seconds, email_poster_url: v.email_poster_url }, v.thumbnail) : null;
  const video = v ? { url: v.url, posterUrl, seconds: v.seconds } : null;
  const opts = { video, signature, links, madeWithAvatar: l.mode === "video" && !!v };
  return { html: leadEmailHtml(l, l.email_draft, opts), text: leadEmailText(l, l.email_draft, opts), subject: l.email_draft.subject, video: v, signature };
}

const SPARKREELS_PER_DAY = 30;

/**
 * Sends it now (leads need a fast reply). A buyer or seller goes through
 * BoldTrail when it's connected, added there as a contact; otherwise, and
 * for every business form, SparkReels sends it as "<Agent> via SparkReels"
 * with replies going to the agent. An avatar spotlight video is also put in
 * the agent's Halo drafts for the site.
 */
export async function sendLead(admin: Admin, user: { id: string; email: string | null }, l: LeadRow): Promise<{ ok: boolean; error?: string; via?: string }> {
  if (!l.email) return { ok: false, error: "This lead has no email address." };
  if (l.mode !== "email" && !l.video_id) return { ok: false, error: "The video isn't ready yet." };
  const built = await buildLeadEmail(admin, user.id, l);
  if (!built) return { ok: false, error: "Write the email first." };

  const { data: claimed } = await admin.from("halo_leads").update({ status: "sending" }).eq("id", l.id).eq("status", "ready").select("id");
  if (!claimed?.length) return { ok: false, error: "This one is already sending." };

  let via: "boldtrail" | "sparkreels" = "sparkreels";
  let ok = false;
  const token = l.kind === "buyer" ? await loadBoldTrailToken(admin, user.id) : null;
  if (token) {
    const [firstName, ...rest] = (l.name ?? "").trim().split(/\s+/);
    const c = await findOrCreateContact(token, { email: l.email, firstName: firstName ?? "", lastName: rest.join(" ") });
    if (c.contact) {
      const r = await sendBoldTrailEmail(token, c.contact.id, built.subject, built.html);
      ok = r.ok; via = "boldtrail";
      if (!r.ok) console.error("[halo-leads] BoldTrail send failed", r.status, r.text);
    }
  }
  if (!ok && via === "sparkreels") {
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { count } = await admin.from("halo_leads").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).eq("sent_via", "sparkreels").gte("sent_at", since);
    if ((count ?? 0) >= SPARKREELS_PER_DAY) {
      await admin.from("halo_leads").update({ status: "ready", error: `Up to ${SPARKREELS_PER_DAY} a day. Try again tomorrow.` }).eq("id", l.id);
      return { ok: false, error: `Up to ${SPARKREELS_PER_DAY} a day. Try again tomorrow.` };
    }
    ok = await sendAgentEmailViaSparkReels({
      to: l.email, agentName: built.signature.name ?? null, replyTo: user.email ?? null,
      subject: built.subject, html: built.html, text: built.text,
    });
  }
  if (!ok) {
    const error = via === "boldtrail" ? "BoldTrail didn't send it. Check BoldTrail is still connected in Settings." : "It didn't send. Try again.";
    await admin.from("halo_leads").update({ status: "ready", error }).eq("id", l.id);
    return { ok: false, error };
  }

  const sentAt = new Date().toISOString();
  await admin.from("halo_leads").update({ status: "sent", sent_at: sentAt, sent_via: via, error: null }).eq("id", l.id);
  await admin.from("api_usage_log").insert({ user_id: user.id, api_provider: via === "boldtrail" ? "boldtrail" : "resend", endpoint: "halo_lead_send", credits_used: 0, response_status: 200 });

  // The spotlight goes in the Halo drafts for the site, to post like any other.
  if (l.kind === "business" && l.mode === "video" && built.video?.project_id && !l.halo_draft_id) {
    try {
      const { data: prof } = await admin.from("profiles").select(HALO_PROFILE_SELECT).eq("id", user.id).single();
      if (prof) {
        const profile = prof as unknown as HaloProfile;
        const { setup, slot } = await sparkleeSetup(admin, user.id, profile, { words: "tomorrow" });
        const { data: d } = await admin.from("autopilot_drafts").insert({
          user_id: user.id, week_of: mondayFor(slot, zoneOf(profile)), slot_at: slot.toISOString(),
          kind: "video", topic: `Spotlight: ${l.business_name || l.name || "local business"}`.slice(0, 300),
          source: "halo", source_kind: "spotlight", source_url: l.site_url,
          setup, status: "draft", project_id: built.video.project_id,
        }).select("id").single();
        if (d) await admin.from("halo_leads").update({ halo_draft_id: (d as { id: string }).id }).eq("id", l.id);
      }
    } catch (err) {
      console.error("[halo-leads] spotlight draft:", err instanceof Error ? err.message : err);
    }
  }
  return { ok: true, via };
}

/** A new lead: a card and a note. Nothing is written or made until the agent asks. */
export async function startNewLead(admin: Admin, userId: string, l: LeadRow): Promise<void> {
  const s = await settingsFor(admin, userId);
  if ((l.kind === "buyer" ? s.buyer : s.business) === "off") {
    await admin.from("halo_leads").update({ status: "skipped" }).eq("id", l.id);
    return;
  }
  const who = l.business_name || l.name || "Someone";
  await addSparkleeNote(admin, {
    userId, kind: "needs",
    title: l.kind === "buyer" ? `New Halo lead: ${who}.` : `${who} asked to be featured on ${l.site || "your site"}.`,
    body: "Write a reply with a video on AutoSparks.",
    actionLabel: "Open AutoSparks", actionHref: "/autosparks", dedupeKey: `halo-lead-${l.id}`,
  }).catch(() => {});
}
