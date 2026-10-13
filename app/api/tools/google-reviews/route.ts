import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { perplexityChat } from "@/lib/api/perplexity";
import { freeTrialGateResponse } from "@/lib/utils/free-trial";
import {
  SocialPublishError, deleteGoogleReviewReply, getDestinations, getProfile, listGoogleReviews, profileUsername,
  replyToGoogleReview, uploadPostConfigured,
} from "@/lib/api/upload-post";

export const maxDuration = 45;
export const dynamic = "force-dynamic";

/**
 * Google reviews for the agent's own business profile: read them, draft a
 * reply, post it, change it, take it down.
 *
 * Through the same Google Business connection that posts go out on, so there
 * is nothing extra to connect. The profile addressed is always derived from
 * the signed-in user.
 *
 * Nothing is ever posted by drafting. A draft is words in a box; the reply
 * goes to Google only on its own request, from its own button.
 */

/** A review's full name at Google, which is what a reply is addressed to. */
const REVIEW_NAME = /^accounts\/[^/\s]+\/locations\/[^/\s]+\/reviews\/[^/\s]+$/;
/** Google's limit on an owner's reply. */
const MAX_REPLY = 4000;

/** A partner refusal as something to show, with no partner in it. */
function plain(err: unknown, doing: "load" | "post" | "remove"): string {
  const raw = err instanceof SocialPublishError ? `${err.raw ?? ""} ${err.message}` : "";
  if (/location/i.test(raw) && /select|choose|several|multiple|required|missing|provided|default/i.test(raw)) {
    return "Choose which business location to use: open Settings, then Social Accounts, and pick it under Google Business.";
  }
  if (/verif/i.test(raw)) return "Google only allows replies on a verified business profile.";
  if (/expired|reauth|re-auth|reconnect|revoked|token/i.test(raw)) {
    return "Google Business needs to be reconnected. Open Settings, then Social Accounts.";
  }
  if (doing === "load") return "Your reviews couldn't be loaded. Try again in a moment.";
  if (doing === "post") return "The reply couldn't be posted. Try again in a moment.";
  return "The reply couldn't be removed. Try again in a moment.";
}

async function signedIn() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("full_name, social_profile_created_at")
    .eq("id", user.id)
    .maybeSingle();
  const profile = data as { full_name: string | null; social_profile_created_at: string | null } | null;
  return { user, name: profile?.full_name ?? null, created: !!profile?.social_profile_created_at };
}

// GET ?pageToken= — a page of reviews, newest first.
export async function GET(req: NextRequest) {
  const me = await signedIn();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!uploadPostConfigured() || !me.created) return NextResponse.json({ connected: false });

  const username = profileUsername(me.user.id);
  try {
    // Asked first, so "not connected" is said as that rather than as an error.
    const profile = await getProfile(username);
    const google = profile?.social_accounts?.google_business;
    if (!google || typeof google !== "object") return NextResponse.json({ connected: false });

    // Which location's reviews. The one chosen under "Posts to" in Settings,
    // or the only one there is. With several and none chosen there is no
    // right answer, so the agent is sent to choose.
    const places = await getDestinations(username, "google_business");
    const location = places.selected ?? (places.options.length === 1 ? places.options[0].id : null);
    if (!location && places.options.length > 1) {
      return NextResponse.json({
        connected: true,
        error: "Choose which business location to use: open Settings, then Social Accounts, and pick it under Google Business.",
      }, { status: 409 });
    }
    if (!location) {
      return NextResponse.json({
        connected: true,
        error: "No business location was found on that Google account. Check it has a Business Profile, then reconnect it in Settings.",
      }, { status: 409 });
    }

    const page = await listGoogleReviews(username, req.nextUrl.searchParams.get("pageToken") || undefined, location);
    return NextResponse.json({ connected: true, ...page });
  } catch (err) {
    console.error("[google-reviews] list:", err instanceof SocialPublishError ? err.raw ?? err.message : err);
    return NextResponse.json({ connected: true, error: plain(err, "load") }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const me = await signedIn();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!uploadPostConfigured() || !me.created) {
    return NextResponse.json({ error: "Connect Google Business in Settings first." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({})) as {
    action?: string; reviewName?: string; text?: string;
    reviewer?: string; stars?: number; review?: string;
  };
  const username = profileUsername(me.user.id);

  // ── Draft: words only, nothing goes to Google ────────────────────────────
  if (body.action === "draft") {
    const gate = await freeTrialGateResponse(me.user.id);
    if (gate) return gate;

    const stars = Math.min(5, Math.max(1, Math.round(Number(body.stars) || 5)));
    const reviewer = (body.reviewer ?? "").trim().split(/\s+/)[0]?.slice(0, 40) || "";
    const review = (body.review ?? "").trim().slice(0, 3000);
    const agent = (me.name ?? "").trim().split(/\s+/)[0] || "";

    try {
      const raw = await perplexityChat([
        {
          role: "system",
          content: [
            "You write the public reply a real estate agent posts under a Google review of their own business.",
            "Write only the reply itself: plain text, no quotation marks around it, no markdown, no citations, no emojis.",
            "Two to four sentences, under 500 characters. Warm and natural, in the first person, the way a person would actually write it.",
            "Address the reviewer by first name when one is given.",
            "If the review says something specific, pick up one thing from it. Never add a detail the review does not contain: no price, address, dates, or anything about their transaction, finances or family.",
            "Never refer to race, religion, national origin, family status, disability, age or any other personal characteristic.",
            "For one to three stars: thank them for saying so, do not argue, do not explain or admit fault, do not share details, and invite them to get in touch directly so it can be put right. Do not include a phone number or email address.",
            "For a rating with no words, thank them for taking the time.",
            agent ? `End with a dash and the agent's first name: ${agent}.` : "Do not sign it.",
          ].join(" "),
        },
        {
          role: "user",
          content: `Rating: ${stars} out of 5\nReviewer's first name: ${reviewer || "(not given)"}\nReview: ${review || "(no words, rating only)"}`,
        },
      ], "sonar");

      const text = raw
        .replace(/\[\d+\]/g, "")
        .replace(/^["“”']+|["“”']+$/g, "")
        .replace(/\*\*/g, "")
        .replace(/[ \t]+\n/g, "\n")
        .trim()
        .slice(0, MAX_REPLY);
      if (!text) throw new Error("empty draft");
      return NextResponse.json({ text });
    } catch (err) {
      console.error("[google-reviews] draft:", err instanceof Error ? err.message : err);
      return NextResponse.json({ error: "A reply couldn't be drafted. Try again, or write your own." }, { status: 502 });
    }
  }

  const reviewName = (body.reviewName ?? "").trim();
  if (!REVIEW_NAME.test(reviewName)) return NextResponse.json({ error: "That review can't be found. Refresh and try again." }, { status: 400 });

  // ── Post, or change, the reply ───────────────────────────────────────────
  if (body.action === "reply") {
    const text = (body.text ?? "").trim();
    if (!text) return NextResponse.json({ error: "Write a reply first." }, { status: 400 });
    if (text.length > MAX_REPLY) return NextResponse.json({ error: `That is too long for Google (${MAX_REPLY} characters).` }, { status: 400 });
    try {
      const reply = await replyToGoogleReview(username, reviewName, text);
      return NextResponse.json({ success: true, reply: { text: reply.text || text, updatedAt: reply.updatedAt || new Date().toISOString() } });
    } catch (err) {
      console.error("[google-reviews] reply:", err instanceof SocialPublishError ? err.raw ?? err.message : err);
      return NextResponse.json({ error: plain(err, "post") }, { status: 502 });
    }
  }

  // ── Take the reply down ──────────────────────────────────────────────────
  if (body.action === "remove") {
    try {
      await deleteGoogleReviewReply(username, reviewName);
      return NextResponse.json({ success: true });
    } catch (err) {
      console.error("[google-reviews] remove:", err instanceof SocialPublishError ? err.raw ?? err.message : err);
      return NextResponse.json({ error: plain(err, "remove") }, { status: 502 });
    }
  }

  return NextResponse.json({ error: "Unknown request." }, { status: 400 });
}
