import { createAdminClient } from "@/lib/supabase/admin";
import { cloneVoice, deleteVoice, resolveVoiceId } from "@/lib/api/heygen";

/**
 * Voice clone slots, recycled.
 *
 * The render service allows a fixed number of cloned voices per ACCOUNT — not
 * per customer — so every clone held by someone who is not currently making
 * videos is capacity taken from someone who is. The clone that mattered most
 * was also the least likely to be used again: the one made during onboarding,
 * spent on a single free video, then held forever by an agent who may never
 * come back.
 *
 * The answer is to stop treating the clone as the durable thing. The SAMPLE is
 * durable — kept in storage, belonging to the agent — and the clone is built
 * from it on demand and given up when idle. An agent records once. Everything
 * else happens where they cannot see it.
 *
 * Two rules hold the whole design together:
 *
 *   1. Nothing is ever retired that a render might still need. Retirement
 *      happens after a video is stored, never on a failure or a refund.
 *   2. Every render asks for the voice through ensureVoiceForRender, so there
 *      is exactly one place that knows how to bring one back.
 */

/** The bucket the sample lives in. Private — see the migration's note on why. */
const SAMPLE_BUCKET = "voice-recordings";

export interface VoiceProfile {
  id: string;
  heygen_voice_id: string | null;
  voice_sample_url: string | null;
}

/**
 * Keep the recording, so the clone never has to be permanent.
 *
 * Stored under the agent's own folder with a fixed name: a voice sample is not
 * a history, it is the current one, and keeping every take of it would be
 * holding on to more of somebody's voice than the feature needs.
 */
export async function saveVoiceSample(
  userId: string,
  audio: Buffer,
  contentType: string,
): Promise<string | null> {
  const admin = createAdminClient();
  const ext = contentType.includes("wav") ? "wav" : contentType.includes("mp4") ? "m4a" : "mp3";
  const path = `${userId}/voice-sample.${ext}`;

  const { error } = await admin.storage
    .from(SAMPLE_BUCKET)
    .upload(path, audio, { contentType, upsert: true });

  if (error) {
    // Not fatal: the clone itself has already been made, and a missing sample
    // costs a re-record later rather than the feature failing now.
    console.error(`[voice-slot] sample not saved for ${userId}: ${error.message}`);
    return null;
  }
  return path;
}

/**
 * The voice this render should use, bringing one back if it has been retired.
 *
 * Returns the same thing resolveVoiceId always did — the agent's own voice, or
 * a neutral public one — so a caller that cannot restore is no worse off than
 * before. A restore that fails falls through to the public voice rather than
 * failing the render: a video in the wrong voice is a disappointment, a video
 * that never renders is a support ticket.
 */
export async function ensureVoiceForRender(profile: VoiceProfile): Promise<string | null> {
  if (profile.heygen_voice_id) return profile.heygen_voice_id;
  if (!profile.voice_sample_url) return resolveVoiceId(null);

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(SAMPLE_BUCKET)
    .download(profile.voice_sample_url);

  if (error || !data) {
    console.error(`[voice-slot] sample unreadable for ${profile.id}: ${error?.message ?? "no data"}`);
    return resolveVoiceId(null);
  }

  try {
    const buffer = Buffer.from(await data.arrayBuffer());
    const voiceId = await cloneVoice(buffer, `My Voice — ${profile.id.slice(0, 8)}`, data.type || "audio/mpeg");
    await admin
      .from("profiles")
      .update({ heygen_voice_id: voiceId, voice_clone_retired_at: null })
      .eq("id", profile.id);
    console.log(`[voice-slot] restored voice for ${profile.id}`);
    return voiceId;
  } catch (err) {
    // Out of slots is the expected failure here, and it is the owner's problem
    // rather than this agent's — their video still renders, in a stock voice.
    console.error(
      `[voice-slot] restore failed for ${profile.id}:`,
      err instanceof Error ? err.message : err,
    );
    return resolveVoiceId(null);
  }
}

/**
 * Give the slot back.
 *
 * Only ever called where the sample is known to be kept, so this is a pause
 * rather than a loss: the next render restores it. Clearing the id is what
 * makes the restore path fire, so it happens even when the service refuses to
 * delete — the alternative is a profile pointing at a voice that may be gone.
 */
export async function retireVoiceClone(
  userId: string,
  voiceId: string | null,
  reason: string,
): Promise<void> {
  if (!voiceId) return;
  const freed = await deleteVoice(voiceId);
  const admin = createAdminClient();
  await admin
    .from("profiles")
    .update({ heygen_voice_id: null, voice_clone_retired_at: new Date().toISOString() })
    .eq("id", userId);
  console.log(`[voice-slot] retired ${voiceId} for ${userId} (${reason})${freed ? "" : " — slot NOT freed"}`);
}

/**
 * Whether this account should give its slot up now that a video is finished.
 *
 * A paying agent keeps their voice: they can render again tomorrow, and making
 * them wait for a restore would be trading their time for capacity that is not
 * scarce for them. A free account with nothing left to render is the case this
 * exists for — the clone has done the one job it was made for.
 *
 * Deliberately not called for admins, whose voices are used for testing and
 * would otherwise vanish between every run.
 */
export function shouldRetireAfterRender(p: {
  role?: string | null;
  subscription_tier?: string | null;
  credits_remaining?: number | null;
  long_credits_remaining?: number | null;
  purchased_short_videos?: number | null;
  purchased_long_videos?: number | null;
  voice_sample_url?: string | null;
}): boolean {
  if (p.role === "admin") return false;
  if (p.subscription_tier && p.subscription_tier !== "free") return false;
  // No sample means retiring would cost them a re-record — not a trade worth
  // making for one slot.
  if (!p.voice_sample_url) return false;
  const left =
    (p.credits_remaining ?? 0) +
    (p.long_credits_remaining ?? 0) +
    (p.purchased_short_videos ?? 0) +
    (p.purchased_long_videos ?? 0);
  return left <= 0;
}

/**
 * The decision and the act, for a render that has just finished.
 *
 * Kept here rather than in the webhook so the rule about WHO gives a slot up
 * lives beside the rule about how. The webhook's job is to say "a video was
 * stored for this person"; everything else is this file's business.
 */
export async function maybeRetireVoiceAfterRender(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("heygen_voice_id, voice_sample_url, role, subscription_tier, credits_remaining, long_credits_remaining, purchased_short_videos, purchased_long_videos")
    .eq("id", userId)
    .single();
  const p = data as (VoiceProfile & Parameters<typeof shouldRetireAfterRender>[0]) | null;
  if (!p?.heygen_voice_id) return;
  if (!shouldRetireAfterRender(p)) return;
  await retireVoiceClone(userId, p.heygen_voice_id, "free account, no videos left");
}
