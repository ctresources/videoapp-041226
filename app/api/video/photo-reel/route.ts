/**
 * POST /api/video/photo-reel
 *
 * Photos in, a finished reel out. Ken Burns on each shot, dissolves between
 * them, your voice over the top and a music bed underneath — rendered with
 * FFmpeg on our own server, so it costs no HeyGen credit.
 *
 * The audio is the interesting decision. renderPhotoSlideshow takes a buffer
 * and cannot tell where the bytes came from, so all three routes end in the
 * same place: a script read by the agent's own cloned voice, a voiceover they
 * recorded themselves, or silence with music over it. The audio's length is
 * also the video's length — the photos are spread across whatever it turns out
 * to be, rather than the other way round.
 */
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureSparkFor } from "@/lib/utils/ensure-spark";
import { generateSpeechWithTimestamps } from "@/lib/api/elevenlabs";
import { generateSeoData } from "@/lib/api/perplexity";
import { searchBackgroundMusic } from "@/lib/api/heygen";
import { ensureVoiceForRender } from "@/lib/utils/voice-slot";
import { renderPhotoSlideshow, generateSilentAudio, audioBufferSeconds, type VideoType } from "@/lib/api/ffmpeg-render";
import { makeCinematicClips, type CinematicClip } from "@/lib/api/cinematic-clips";
import { ALLOWANCE_SELECT, chargeFor, chargeOneVideo, type AllowanceColumns } from "@/lib/utils/video-allowance";
import { CINEMATIC_DISCLOSURE, SCENES_DISCLOSURE } from "@/lib/utils/ai-made";
import { formatPhone } from "@/lib/utils/format-phone";
import { makeSceneClips, planScenes, planScenesForBeats, SCENES_MAX, SCENES_MAX_SECONDS, SCENES_MIN, type SceneAspect } from "@/lib/api/scene-clips";
import { beatsFromWords } from "@/lib/utils/script-beats";
import { speakLongInVoice } from "@/lib/api/long-speech";
import type { WordTimestamp } from "@/lib/api/whisper";
import { transcribeToWords } from "@/lib/utils/srt";
import { NextRequest, NextResponse } from "next/server";

// A minute of 1080x1920 with twelve photos measured near three minutes on this
// hardware. 300 is what the plan allows and what the longest reel needs.
// A ninety second Scenes reel is its speech, a dozen scenes and a render of
// about twice its own length. That is past 300 seconds; 800 is what the
// project's functions are allowed, and what the webhook already runs at.
export const maxDuration = 800;

const FORMATS: Record<string, VideoType> = {
  reel_9x16: "reel_9x16",
  short_1x1: "short_1x1",
  youtube_16x9: "youtube_16x9",
};

/** Long enough to be a video, short enough to finish inside the budget. */
const MIN_SECONDS = 5;
const MAX_SECONDS = 90;
const MAX_PHOTOS = 12;

/**
 * Cinematic: each photo becomes a short moving clip. See cinematic-clips.ts.
 *
 * Smaller limits than the classic reel until it has been timed on the live
 * server: every photo is a generated clip that is made, checked and possibly
 * made again before the render can start.
 */
const CINEMATIC_MAX_PHOTOS = 8;
const CINEMATIC_MAX_SECONDS = 60;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    photoUrls?: string[];
    /** A line per photo, by index — "AFTER · Kitchen" and the like. Sparse. */
    photoCaptions?: (string | null)[];
    title?: string;
    format?: string;
    seconds?: number;
    /** Read aloud in the agent's cloned voice. */
    script?: string;
    /** Storage path of a voiceover they recorded themselves — wins over script. */
    voiceoverPath?: string;
    /** Music preset search query, or null for none. */
    musicQuery?: string | null;
    /** Burn the spoken words into the picture. Ignored with nothing spoken. */
    captions?: boolean;
    /** Closing card over the last few seconds. Off when false or absent. */
    endCard?: boolean;
    /** Its opening line — the ask itself. */
    endCardHeadline?: string;
    /**
     * "cinematic" turns each photo into a moving clip and counts as one short
     * video from the plan. Anything else is the classic reel, which is free.
     */
    motion?: string;
    /**
     * A Scenes reel: no photos, the pictures are made from the script. Needs
     * `script`, runs up to a minute, and counts as one short video.
     */
    scenes?: boolean;
    /**
     * A Spark this reel belongs to, when it is that Spark's video.
     *
     * "Voice only" on the video setup screen builds a short script this way.
     * The script, the title and the post copy were written there already, so
     * the reel is attached to that project and none of them is written again.
     */
    projectId?: string;
    /** A chosen music track's address, used as it is in place of a search. */
    musicUrl?: string;
    /** The property, if this reel is about one. */
    address?: string;
    city?: string;
    state?: string;
  };

  const scenes = body.scenes === true;
  const requestStarted = Date.now();
  const photoUrls = scenes ? [] : (body.photoUrls ?? []).filter(Boolean).slice(0, MAX_PHOTOS);
  if (!scenes && photoUrls.length === 0) {
    return NextResponse.json({ error: "Add at least one photo." }, { status: 400 });
  }
  if (scenes && (body.script ?? "").trim().split(/\s+/).filter(Boolean).length < 8) {
    return NextResponse.json({ error: "Write a few sentences for it to read. The scenes are made from the script." }, { status: 400 });
  }

  const cinematic = !scenes && body.motion === "cinematic";
  if (cinematic && photoUrls.length > CINEMATIC_MAX_PHOTOS) {
    return NextResponse.json(
      { error: `A Cinematic reel uses up to ${CINEMATIC_MAX_PHOTOS} photos. Remove some, or choose Classic.` },
      { status: 400 },
    );
  }

  const videoType = FORMATS[body.format ?? "reel_9x16"] ?? "reel_9x16";
  const title = (body.title || (scenes ? "Scenes Reel" : "Photo Reel")).slice(0, 120);
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select(`id, full_name, company_name, logo_url, avatar_url, voice_clone_id, heygen_voice_id, voice_sample_url, location_city, location_state, phone, company_phone, role, subscription_tier, first_video_generated_at, ${ALLOWANCE_SELECT}`)
    .eq("id", user.id)
    .single();
  const p = (profile ?? {}) as Record<string, string | null>;

  // Theirs, or it is not attached to anything.
  let ownProject: { id: string; seo_data: Record<string, unknown> | null } | null = null;
  if (body.projectId) {
    const { data: row } = await admin
      .from("projects")
      .select("id, user_id, seo_data")
      .eq("id", body.projectId)
      .maybeSingle();
    const found = row as { id: string; user_id: string; seo_data: Record<string, unknown> | null } | null;
    if (!found || found.user_id !== user.id) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    ownProject = { id: found.id, seo_data: found.seo_data };
  }

  /**
   * A Cinematic reel counts as one short video, so it needs one to count.
   *
   * Asked before anything is made: the narration and the clips both cost
   * money to produce, and finding out at the end that there was nothing to
   * charge would mean having given the reel away. Only checked here. The
   * video is actually taken after the reel exists, so a render that fails
   * takes nothing and there is no refund to get right.
   */
  const isAdmin = p.role === "admin";
  if ((cinematic || scenes) && !isAdmin && !chargeFor((profile ?? {}) as Partial<AllowanceColumns>, "short")) {
    return NextResponse.json(
      {
        code: "out_of_videos",
        kind: "short",
        tier: p.subscription_tier ?? "free",
        error: scenes
          ? "A Scenes reel uses one short video and you have none left. Add more in Billing."
          : "A Cinematic reel uses one short video and you have none left. Choose Classic, which is free, or add more in Billing.",
      },
      { status: 402 },
    );
  }

  try {
    // ── Audio, from whichever of the three routes was chosen ────────────────
    let audioBuffer: Buffer;
    /** Known only for a music-only reel, whose length was chosen. Lets a 7, 12 or 30 second reel post as video where 30 seconds is the limit. */
    let reelSeconds: number | null = null;
    let wordTimestamps: WordTimestamp[] = [];
    /** When each word of a written script is spoken, kept whether or not captions were asked for: a Scenes reel cuts its scenes to it. */
    let timingWords: WordTimestamp[] = [];
    let spokenScript = "";
    /** Which voice read a typed script, for the form to say so. Unset when nothing was read. */
    let voiceUsed: "yours" | "stock" | null = null;

    if (body.voiceoverPath) {
      // Their own recording. Downloaded rather than trusted from the client:
      // the path is theirs to name, so it is checked against their own folder.
      if (!body.voiceoverPath.startsWith(`camera-recordings/${user.id}/`)) {
        return NextResponse.json({ error: "Invalid recording path" }, { status: 403 });
      }
      const { data, error } = await admin.storage.from("assets").download(body.voiceoverPath);
      if (error || !data) throw new Error("Could not read that voiceover recording.");
      audioBuffer = Buffer.from(await data.arrayBuffer());

      /**
       * A recording carries no timings, so captioning one means listening to it.
       *
       * Synthesised speech comes back with word timings attached, because the
       * model decided when every word happened. A person talking into a
       * microphone leaves no such record — the only way to know when they said
       * "kitchen" is to transcribe it. That costs a second API call and a few
       * seconds, which is why it happens only when captions were asked for.
       *
       * Non-fatal: losing the captions is a worse video, losing the render is
       * no video.
       */
      if (body.captions) {
        try {
          wordTimestamps = await transcribeToWords(audioBuffer, "audio/webm");
        } catch (e) {
          console.warn("[photo-reel] could not transcribe the voiceover for captions:", e);
        }
      }
    } else if (body.script?.trim()) {
      /**
       * Their own voice, which is the clone the avatar videos use.
       *
       * This read from `voice_clone_id`, an older clone at another provider
       * that no account has any more, so every script was read in a stock
       * voice while the page said "your cloned voice". The clone people
       * actually make in Settings is the one tried first now, brought back if
       * it had been retired for being idle. Speech alone is not a render, so
       * this still costs no video.
       *
       * If that fails the older path still reads it, in the old clone or a
       * stock voice, and the reply says which so the form can tell them.
       */
      const text = body.script.trim();
      let speech: { audioBuffer: Buffer; wordTimestamps: WordTimestamp[] } | null = null;
      if (p.heygen_voice_id || p.voice_sample_url) {
        try {
          const own = await ensureVoiceForRender({
            id: user.id,
            heygen_voice_id: p.heygen_voice_id,
            voice_sample_url: p.voice_sample_url,
          });
          // ensureVoiceForRender hands back a public voice when the clone
          // could not be restored. That is not "their voice", so it is left
          // to the fallback below rather than reported as one.
          const { data: now } = await admin.from("profiles").select("heygen_voice_id").eq("id", user.id).single();
          const mine = (now as { heygen_voice_id: string | null } | null)?.heygen_voice_id;
          if (own && mine && own === mine) {
            // In parts, spoken together: one request for a long script does
            // not come back in time, and the reel was read by a stock voice.
            speech = await speakLongInVoice(text, own);
            voiceUsed = "yours";
          }
        } catch (e) {
          console.warn("[photo-reel] own voice not used:", e instanceof Error ? e.message : e);
        }
      }
      if (!speech) {
        speech = await generateSpeechWithTimestamps(text, p.voice_clone_id);
        voiceUsed = p.voice_clone_id ? "yours" : "stock";
      }
      audioBuffer = speech.audioBuffer;
      // Free and exact here: the timings arrive with the audio, so captions on
      // a written script cost nothing and never mishear a street name. Where a
      // voice came back without them, the audio is listened to instead.
      timingWords = speech.wordTimestamps;
      wordTimestamps = body.captions ? speech.wordTimestamps : [];
      if (body.captions && !wordTimestamps.length) {
        try {
          wordTimestamps = await transcribeToWords(audioBuffer, "audio/mpeg");
        } catch (e) {
          console.warn("[photo-reel] could not time the narration for captions:", e);
        }
      }
      spokenScript = text;
    } else {
      // Music only. Silence sets the length precisely, which nothing else here
      // can: a music track is however long it is, and the reel is not.
      const seconds = Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.round(body.seconds ?? 30)));
      audioBuffer = await generateSilentAudio(seconds);
      reelSeconds = seconds;
    }

    /**
     * ── Cinematic clips ──
     *
     * Made once the reel's length is known, because each clip is asked for at
     * the length its photo will be on screen. A photo whose clip could not be
     * made, or whose clip did not stay on the photo, comes back empty and the
     * renderer shows it the classic way.
     */
    let clips: (CinematicClip | null)[] = [];
    let moving = 0;
    if (cinematic) {
      const seconds = reelSeconds ?? (await audioBufferSeconds(audioBuffer));
      if (seconds > CINEMATIC_MAX_SECONDS + 2) {
        return NextResponse.json(
          { error: `A Cinematic reel runs up to ${CINEMATIC_MAX_SECONDS} seconds and this one is ${Math.round(seconds)}. Shorten the narration, or choose Classic.` },
          { status: 400 },
        );
      }
      clips = await makeCinematicClips(photoUrls, seconds / photoUrls.length);
      moving = clips.filter(Boolean).length;
    }

    /**
     * ── Scenes ──
     *
     * The pictures for a reel that has none: one generated clip for each part
     * of the narration. Planned from the script, made a few at a time, and
     * stopped in time to leave the render its share of this request. A scene
     * that could not be made is left out and the others share its time; fewer
     * than three is not a reel, and nothing is taken for it.
     */
    let segmentUrls: string[] = photoUrls;
    let scenesAsked = 0;
    /** When each scene comes on, where the scenes were cut to the sentences. */
    let segmentStarts: number[] | undefined;
    if (scenes) {
      const seconds = await audioBufferSeconds(audioBuffer);
      if (seconds > SCENES_MAX_SECONDS + 4) {
        return NextResponse.json(
          { error: `A Scenes reel runs up to ${SCENES_MAX_SECONDS} seconds and this script reads at about ${Math.round(seconds)}. Shorten it to roughly ${Math.round(SCENES_MAX_SECONDS * 2.35)} words.` },
          { status: 400 },
        );
      }
      const aspect: SceneAspect = videoType === "youtube_16x9" ? "16:9" : videoType === "short_1x1" ? "1:1" : "9:16";
      const notEnough = () => NextResponse.json(
        { error: "Not enough scenes could be made this time, so nothing was taken from your plan. Try again in a minute." },
        { status: 502 },
      );
      // Clips are given two and a half minutes from here; the render has the rest.
      const giveUpAt = Date.now() + 150_000;

      /**
       * A scene for each sentence, on screen while it is spoken.
       *
       * The scenes used to be a handful that shared the time evenly, chosen by
       * a planner that only knew homes and rooms. They follow the narration
       * now, as the scenes behind an avatar video do: the speech comes with a
       * time for every word, so it is cut into its sentences, each is given a
       * picture of what it is about, and that picture comes on when the
       * sentence starts. People may appear, from behind or at a distance.
       */
      const beats = timingWords.length > 0 ? beatsFromWords(timingWords, 4, SCENES_MAX, 10) : [];
      const matched = beats.length >= SCENES_MIN ? await planScenesForBeats(beats.map((b) => b.text)) : [];
      if (matched.length === beats.length && matched.length >= SCENES_MIN) {
        scenesAsked = beats.length;
        const lengths = beats.map((b, i) => (i === beats.length - 1 ? seconds : beats[i + 1].start) - b.start);
        const made = await makeSceneClips(matched, lengths, aspect, giveUpAt, "distant-people");
        const kept = made.map((c, i) => ({ c, i })).filter((x): x is { c: NonNullable<typeof x.c>; i: number } => !!x.c);
        if (kept.length < Math.max(SCENES_MIN, Math.ceil(beats.length / 2))) return notEnough();
        clips = kept.map(({ c }) => ({ ...c, similarity: 1 }));
        // A scene that could not be made leaves its sentence to the one before.
        segmentStarts = kept.map(({ i }, k) => (k === 0 ? 0 : beats[i].start));
        segmentUrls = kept.map(() => "");
        moving = kept.length;
      } else {
        // No timings to cut to, or no plan: the scenes share the time evenly.
        scenesAsked = Math.min(SCENES_MAX, Math.max(SCENES_MIN, Math.round(seconds / 7)));
        const plan = await planScenes(spokenScript, scenesAsked);
        const made = (await makeSceneClips(plan, seconds / scenesAsked, aspect, giveUpAt))
          .filter((c): c is NonNullable<typeof c> => !!c);
        if (made.length < SCENES_MIN) return notEnough();
        // The renderer takes a clip per segment, in place of a photo. There is no
        // photo behind these, so the list that stands for them is empty strings.
        clips = made.map((c) => ({ ...c, similarity: 1 }));
        segmentUrls = made.map(() => "");
        moving = made.length;
      }
    }
    /**
     * Whether this is worth a video from their plan. More than half the photos
     * have to be moving. A reel where most fell back to the classic pan is a
     * classic reel with a few extras, and the classic reel is free. A Scenes
     * reel that got this far has its scenes, and is one.
     */
    const earnedItsCharge = scenes || (cinematic && moving * 2 > photoUrls.length);

    // ── Music bed ───────────────────────────────────────────────────────────
    let musicUrl: string | null = body.musicUrl?.startsWith("https://") ? body.musicUrl : null;
    if (!musicUrl && body.musicQuery) {
      try {
        musicUrl = (await searchBackgroundMusic(body.musicQuery, 1))[0]?.audio_url ?? null;
      } catch (e) {
        // A reel without music beats no reel. Said in the log, not to the user.
        console.warn("[photo-reel] music lookup failed:", e);
      }
    }

    // With no narration the bed is the whole soundtrack, so it comes up to
    // where a bed under a voice would be drowned out.
    const musicVolume = spokenScript || body.voiceoverPath ? 0.15 : 0.55;

    /**
     * Post copy — the title, description and hashtags Publish needs.
     *
     * Every scripted route writes these when the script is written. A reel has
     * no script-writing step, so reels arrived in My Content with nothing to
     * post them with: Publish reads seo_data off the project, and this route
     * never wrote any.
     *
     * Started here rather than after the render so it costs no wall clock —
     * it resolves while FFmpeg works, and a long reel is minutes of that. It
     * must also never be the thing that pushes this request past its budget,
     * hence the race: a reel with no post copy is recoverable, a request that
     * dies after the video is stored orphans a finished video.
     *
     * What it summarises depends on what the reel actually has. A written
     * script is the real thing. A recorded voiceover has one only if captions
     * were asked for, which is what put a transcript in wordTimestamps. Music
     * only has no words at all — so its copy comes from what the form
     * collected: the photo captions, the property, the market.
     */
    const seoSource = [
      spokenScript,
      !spokenScript && wordTimestamps.length ? wordTimestamps.map((w) => w.word).join(" ") : "",
      (body.photoCaptions ?? []).filter(Boolean).join(". "),
      body.address ?? "",
      [body.city, body.state].filter(Boolean).join(", "),
    ].filter(Boolean).join("\n").trim();

    /**
     * The title is material too, and leaving it out of this check was a bug.
     *
     * A music-only reel has no script, no transcript, and often no captions
     * and no address — so seoSource was empty and generation was skipped, on
     * exactly the reels that need the post copy most. The title alone ("Welcome
     * to 24 Shagbark Ct E, Harleysville, PA") is plenty to write from, and it
     * is already being passed as the subject; it just was not being counted.
     */
    const titleIsReal = (body.title ?? "").trim().length > 3;
    const seoPromise: Promise<Awaited<ReturnType<typeof generateSeoData>> | null> =
      // A Spark that already exists has its post copy; see projectId.
      !ownProject && (seoSource.length > 20 || titleIsReal)
        ? Promise.race([
            generateSeoData(title, seoSource || title, [body.city, body.state].filter(Boolean) as string[]),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 30_000)),
          ]).catch((e) => {
            console.warn("[photo-reel] post copy failed (non-fatal):", e);
            return null;
          })
        : Promise.resolve(null);

    const mp4 = await renderPhotoSlideshow(
      {
        title,
        audioBuffer,
        photoUrls: segmentUrls,
        wordTimestamps,
        ...(moving > 0 && { clips }),
        // A generated scene is not played backwards; see the renderer.
        ...(scenes && { reverseAlternate: false }),
        ...(segmentStarts && { segmentStarts }),
        // Trimmed to the photos that survived the cap, so a caption cannot end
        // up on the photo after the one it was written for.
        photoCaptions: (scenes ? [] : body.photoCaptions ?? [])
          .slice(0, photoUrls.length)
          .map((c) => (typeof c === "string" ? c.trim().slice(0, 80) : "")),
        logoUrl: p.logo_url ?? undefined,
        avatarUrl: p.avatar_url ?? undefined,
        agentName: p.full_name ?? undefined,
        musicUrl,
        musicVolume,
        /**
         * Built from what is already known rather than asked for again: the
         * market came from the form, the phone from the profile. Only the
         * headline is theirs to write, because it is the only line whose
         * wording is a decision.
         *
         * Null when they turned it off, and null again when nothing survived —
         * a closing card carrying only a headline and no way to act on it is
         * worse than ending on the last photograph.
         */
        endCard: body.endCard === false ? null : (() => {
          const market = [body.city, body.state].filter(Boolean).join(", ");
          // As it is read, 610-457-8698, not the ten bare digits most
          // profiles hold. The contact card on a rendered video already did
          // this; the closing card on a reel was printing what was stored.
          const phone = formatPhone(p.phone || p.company_phone);
          const address = (body.address || "").trim();
          if (!phone && !address && !market) return null;
          return {
            headline: (body.endCardHeadline || "See it in person").trim().slice(0, 60),
            address: address.slice(0, 80),
            market: market.slice(0, 80),
            phone,
          };
        })(),
      },
      videoType,
    );

    // ── Store it and register it like any other finished video ──────────────
    const storagePath = `camera-recordings/${user.id}/reel-${Date.now()}.mp4`;
    const { error: upErr } = await admin.storage
      .from("assets")
      .upload(storagePath, mp4, { contentType: "video/mp4", upsert: false });
    if (upErr) throw new Error(`Could not save the finished reel: ${upErr.message}`);

    const { data: { publicUrl } } = admin.storage.from("assets").getPublicUrl(storagePath);

    // Resolved by now in every real case — it has had the whole render to
    // finish. Awaited here rather than earlier so it never delays the video.
    const seo = await seoPromise;

    /**
     * Taken now, with the reel made and stored. Admins are not charged, as
     * everywhere else. If the balance was spent by another tab in the minute
     * this took, the reel is still theirs: it exists, and refusing to hand it
     * over would waste what it cost to make.
     */
    let charged: Awaited<ReturnType<typeof chargeOneVideo>> = null;
    if (earnedItsCharge && !isAdmin) {
      charged = await chargeOneVideo(admin, user.id, "short");
      if (!charged) console.warn("[photo-reel] cinematic reel made but nothing was left to charge");
      // The free video starts the 30-day clock, whichever kind of video it was.
      if (charged && (p.subscription_tier ?? "free") === "free" && !p.first_video_generated_at) {
        await admin.from("profiles").update({ first_video_generated_at: new Date().toISOString() }).eq("id", user.id);
      }
    }

    /**
     * Said in the description, which is where the owner chose to say it.
     * Only when something in the reel actually moves: a Cinematic reel whose
     * every photo fell back is a classic reel, and has nothing to disclose.
     */
    const disclosure = scenes ? SCENES_DISCLOSURE : CINEMATIC_DISCLOSURE;
    const describe = (text: string | undefined) =>
      moving > 0 ? [text?.trim(), disclosure].filter(Boolean).join("\n\n") : text;
    const seoData: Record<string, unknown> | null = seo
      ? { ...seo, youtube_title: seo.youtube_title || title, youtube_description: describe(seo.youtube_description) }
      : moving > 0
        ? { youtube_title: title, youtube_description: disclosure }
        : null;

    let project: { id: string } | null = null;
    let projErr: { message: string } | null = null;
    if (ownProject) {
      // Its own script and post copy stand. Only what this made is added:
      // that it is ready, and the line saying the scenes were generated.
      const had = ownProject.seo_data ?? {};
      const said = typeof had.youtube_description === "string" ? had.youtube_description : "";
      const { error } = await admin
        .from("projects")
        .update({
          status: "ready",
          ...(moving > 0 && !said.includes(disclosure) && {
            seo_data: { ...had, youtube_description: [said.trim(), disclosure].filter(Boolean).join("\n\n") },
          }),
        })
        .eq("id", ownProject.id)
        .eq("user_id", user.id);
      project = { id: ownProject.id };
      projErr = error;
    } else {
    const made = await admin
      .from("projects")
      .insert({
        user_id: user.id,
        title,
        project_type: "location_script",
        status: "ready",
        ...(body.city && { location_city: body.city }),
        ...(body.state && { location_state: body.state }),
        ...(spokenScript && {
          ai_script: { title, script: spokenScript, hook: "", cta: "", keywords: [] },
        }),
        // The title the agent typed wins over the model's: it is the one
        // burned into the opening of the video, and a Publish window offering
        // a different one would be offering to contradict the picture.
        ...(seoData && { seo_data: seoData }),
      })
      .select("id")
      .single();
      project = made.data as { id: string } | null;
      projErr = made.error;
    }
    if (projErr || !project) throw new Error(projErr?.message || "Could not create the project");

    // Never throws, so it cannot cost the reel that was just created.
    await ensureSparkFor(admin, user.id, (project as { id: string }).id);

    const { data: videoRow, error: vidErr } = await admin
      .from("generated_videos")
      .insert({
        project_id: (project as { id: string }).id,
        user_id: user.id,
        video_url: publicUrl,
        video_type: videoType,
        render_provider: "ffmpeg",
        render_status: "completed",
        ...(reelSeconds ? { duration_seconds: reelSeconds } : {}),
        metadata: {
          source: scenes ? "scenes-reel" : "photo-reel",
          photos: photoUrls.length,
          // Read by isAiMadeVideo, which decides the platform disclosures.
          // Set only when something moves; see the description above.
          ...(moving > 0 && {
            motion: scenes ? "scenes" : "cinematic",
            cinematic_clips: moving,
            cinematic_seconds: Math.round(clips.reduce((sum, c) => sum + (c?.seconds ?? 0), 0)),
          }),
          ...(charged && { credit_cost: 1, credit_kind: "short", credit_source: charged.source }),
        },
      })
      .select("id")
      .single();
    if (vidErr || !videoRow) throw new Error(vidErr?.message || "Could not save the video");

    if (cinematic || scenes) {
      await admin.from("api_usage_log").insert({
        user_id: user.id,
        api_provider: "heygen",
        endpoint: scenes ? "scenes-reel" : "cinematic-reel",
        credits_used: charged ? 1 : 0,
        response_status: 200,
      });
    }

    return NextResponse.json({
      videoId: (videoRow as { id: string }).id,
      videoUrl: publicUrl,
      title,
      // Which voice read a typed script: theirs, or a stock one it fell back to.
      ...(voiceUsed && { voice: voiceUsed }),
      // For the form to say what actually happened: how many photos moved,
      // and whether a video was taken from the plan for it.
      ...(cinematic && { cinematic: { moving, photos: photoUrls.length, charged: !!charged || (isAdmin && earnedItsCharge) } }),
      ...(scenes && { scenes: { made: moving, asked: scenesAsked, charged: !!charged || isAdmin } }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not build that reel";
    console.error("[photo-reel]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
