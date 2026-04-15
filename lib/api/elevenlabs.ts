/**
 * ElevenLabs Text-to-Speech.
 *
 * Two modes:
 *   • generateSpeech()              — returns MP3 audio buffer only
 *   • generateSpeechWithTimestamps() — returns MP3 + word-level timestamps
 *
 * The timestamps mode uses ElevenLabs' /with-timestamps endpoint so we
 * get word timing data for free — no OpenAI Whisper needed.
 */

const ELEVENLABS_API = "https://api.elevenlabs.io/v1";
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel (default)

export interface WordTimestamp {
  word: string;
  start: number;  // seconds
  end: number;    // seconds
}

export interface SpeechResult {
  audioBuffer: Buffer;
  wordTimestamps: WordTimestamp[];
}

/**
 * Generate speech AND word-level timestamps in a single API call.
 * Uses ElevenLabs' /with-timestamps endpoint.
 * No Whisper / OpenAI key needed.
 *
 * Falls back to DEFAULT_VOICE_ID if the requested voice clone fails
 * (e.g. the voice doesn't support this model or has been deleted).
 */
export async function generateSpeechWithTimestamps(
  text: string,
  voiceId?: string | null,
): Promise<SpeechResult> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set");

  // Build list of voices to attempt — try custom voice first, then default
  const voicesToTry: string[] = [];
  if (voiceId && voiceId !== DEFAULT_VOICE_ID) voicesToTry.push(voiceId);
  voicesToTry.push(DEFAULT_VOICE_ID);

  let lastError = "ElevenLabs TTS failed";

  for (const voice of voicesToTry) {
    try {
      const res = await fetch(`${ELEVENLABS_API}/text-to-speech/${voice}/with-timestamps`, {
        method: "POST",
        headers: {
          "xi-api-key": key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.8,
            style: 0.0,
            use_speaker_boost: true,
          },
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "unknown");
        lastError = `ElevenLabs voice ${voice} failed (${res.status}): ${errText.slice(0, 200)}`;
        console.warn(`[elevenlabs] ${lastError} — trying next voice`);
        continue;
      }

      const data = await res.json() as {
        audio_base64: string;
        alignment: {
          characters: string[];
          character_start_times_seconds: number[];
          character_end_times_seconds: number[];
        };
      };

      // Decode audio from base64
      const audioBuffer = Buffer.from(data.audio_base64, "base64");

      // Convert character-level timestamps to word-level timestamps
      const wordTimestamps = charTimesToWordTimes(
        data.alignment.characters,
        data.alignment.character_start_times_seconds,
        data.alignment.character_end_times_seconds,
      );

      if (voice !== voiceId) {
        console.warn(`[elevenlabs] Used fallback voice ${voice} (requested: ${voiceId})`);
      }

      return { audioBuffer, wordTimestamps };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(`[elevenlabs] Voice ${voice} threw: ${lastError}`);
    }
  }

  throw new Error(lastError);
}

/**
 * Simple speech generation (audio only, no timestamps).
 * Kept for backward compatibility with voice preview etc.
 */
export async function generateSpeech(
  text: string,
  voiceId?: string | null,
): Promise<Buffer> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set");

  const voice = voiceId || DEFAULT_VOICE_ID;

  const res = await fetch(`${ELEVENLABS_API}/text-to-speech/${voice}`, {
    method: "POST",
    headers: {
      "xi-api-key": key,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.8,
        style: 0.0,
        use_speaker_boost: true,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "unknown");
    throw new Error(`ElevenLabs TTS failed (${res.status}): ${errText.slice(0, 200)}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Convert ElevenLabs character-level timestamps into word-level timestamps.
 * ElevenLabs returns per-character timing; we group by whitespace boundaries.
 */
function charTimesToWordTimes(
  chars: string[],
  starts: number[],
  ends: number[],
): WordTimestamp[] {
  const words: WordTimestamp[] = [];
  let currentWord = "";
  let wordStart = 0;
  let wordEnd = 0;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];

    if (ch === " " || ch === "\n" || ch === "\t") {
      if (currentWord.length > 0) {
        words.push({ word: currentWord, start: wordStart, end: wordEnd });
        currentWord = "";
      }
    } else {
      if (currentWord.length === 0) wordStart = starts[i];
      currentWord += ch;
      wordEnd = ends[i];
    }
  }

  if (currentWord.length > 0) {
    words.push({ word: currentWord, start: wordStart, end: wordEnd });
  }

  return words;
}
