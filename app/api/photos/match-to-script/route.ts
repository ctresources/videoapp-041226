/**
 * POST /api/photos/match-to-script
 *
 * Puts a set of photos in the order the script talks about them.
 *
 * A listing script is written as one block of prose — it has no scenes and no
 * sections — and nothing in the app knows what any photo shows. So photo 3 is
 * "the third file you picked" and nothing more, which is why the narration and
 * the pictures drift apart: the script reaches the kitchen while a bedroom is
 * on screen.
 *
 * Two steps, and only the first costs anything. One vision call labels every
 * photo with a room. Then the SCRIPT is scanned for those same rooms, in the
 * order it first mentions each, and the photos are dealt out to match. The
 * second half is deliberately not an AI call: a deterministic scan can be read,
 * predicted and argued with, and a model asked to "order these" gives an answer
 * nobody can check.
 *
 * Best effort throughout. Without an OPENAI_API_KEY, or on any failure, the
 * caller is told plainly and keeps the order it already had.
 */
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * The vocabulary, shared by both halves.
 *
 * Closed deliberately: the labeller can only answer with one of these, and the
 * script is only scanned for these, so the two halves cannot drift apart. The
 * synonyms are what an agent actually writes — "primary suite", "great room" —
 * rather than what a model might label a photograph.
 */
const ROOMS: { key: string; words: string[] }[] = [
  { key: "exterior", words: ["exterior", "curb appeal", "front of the home", "front door", "facade", "driveway", "welcome to"] },
  { key: "living", words: ["living room", "great room", "family room", "sitting room", "fireplace"] },
  { key: "kitchen", words: ["kitchen", "countertop", "island", "cabinetry", "appliances", "backsplash"] },
  { key: "dining", words: ["dining room", "dining area", "breakfast nook", "eat-in"] },
  { key: "primary_bedroom", words: ["primary bedroom", "primary suite", "master bedroom", "master suite", "owner's suite"] },
  { key: "bedroom", words: ["bedroom", "guest room", "nursery"] },
  { key: "bathroom", words: ["bathroom", "bath", "shower", "vanity", "powder room", "en suite", "ensuite"] },
  { key: "basement", words: ["basement", "lower level", "rec room", "recreation room"] },
  { key: "office", words: ["office", "study", "den", "workspace"] },
  { key: "laundry", words: ["laundry", "mudroom", "utility room"] },
  { key: "garage", words: ["garage", "carport"] },
  { key: "yard", words: ["yard", "garden", "patio", "deck", "porch", "outdoor", "landscap", "backyard"] },
  { key: "pool", words: ["pool", "hot tub", "spa"] },
  { key: "view", words: ["view", "overlook", "vista", "waterfront"] },
  { key: "community", words: ["community", "clubhouse", "neighborhood", "amenities", "playground", "trail"] },
];

const ROOM_KEYS = ROOMS.map((r) => r.key);

/** The order the script first mentions each room. Rooms it never names are absent. */
function scriptRoomOrder(script: string): string[] {
  const hay = script.toLowerCase();
  const firstAt = new Map<string, number>();

  for (const { key, words } of ROOMS) {
    let earliest = Infinity;
    for (const w of words) {
      const at = hay.indexOf(w.toLowerCase());
      if (at >= 0 && at < earliest) earliest = at;
    }
    if (earliest !== Infinity) firstAt.set(key, earliest);
  }

  // "primary bedroom" also contains "bedroom", so the generic match lands at
  // the same place as the specific one. Sorting by position keeps them in the
  // order they were written, and the dealing below never gives one photo to
  // two rooms.
  return Array.from(firstAt.entries()).sort((a, b) => a[1] - b[1]).map(([key]) => key);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { photoUrls, script } = (await req.json().catch(() => ({}))) as {
    photoUrls?: string[];
    script?: string;
  };

  const urls = (photoUrls ?? []).filter((u) => typeof u === "string" && u.startsWith("http")).slice(0, 12);
  if (urls.length < 2) {
    return NextResponse.json({ error: "Add at least two photos to reorder them." }, { status: 400 });
  }
  if (!script?.trim()) {
    return NextResponse.json({ error: "Write the script first — the order comes from it." }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Photo matching isn't set up on this account yet." },
      { status: 503 },
    );
  }

  let labels: string[];
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    // One call with every image rather than one per photo: same answer, a
    // twelfth of the round trips, and it cannot half-succeed.
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 300,
      messages: [
        {
          role: "system",
          content:
            `Label each real-estate photo with exactly one room from this list: ${ROOM_KEYS.join(", ")}. ` +
            `Reply with ONLY a JSON array of strings, one per photo, in the order given. No prose.`,
        },
        {
          role: "user",
          content: [
            { type: "text", text: `Label these ${urls.length} photos in order.` },
            // "low" detail is enough to tell a kitchen from a bedroom and is
            // markedly cheaper than analysing each at full resolution.
            ...urls.map((url) => ({ type: "image_url" as const, image_url: { url, detail: "low" as const } })),
          ],
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const json = raw.replace(/^```(?:json)?|```$/g, "").trim();
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) throw new Error("not an array");
    labels = urls.map((_, i) => {
      const v = typeof parsed[i] === "string" ? (parsed[i] as string).toLowerCase().trim() : "";
      return ROOM_KEYS.includes(v) ? v : "";
    });
  } catch (err) {
    console.warn("[match-to-script] labelling failed:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Couldn't read the photos this time. Your order is unchanged." },
      { status: 502 },
    );
  }

  /**
   * Deal the photos out in the script's order.
   *
   * A room the script names more than once still only claims photos once, and
   * a room with several photos keeps them together in their existing relative
   * order — three kitchen shots stay a run of three, rather than being
   * interleaved with something else. Anything the script never mentions keeps
   * its own order and follows at the end, so no photo is ever dropped.
   */
  const order = scriptRoomOrder(script);
  const taken = new Set<number>();
  const sequenced: string[] = [];

  for (const room of order) {
    labels.forEach((label, i) => {
      if (label === room && !taken.has(i)) {
        taken.add(i);
        sequenced.push(urls[i]);
      }
    });
  }
  urls.forEach((u, i) => { if (!taken.has(i)) sequenced.push(u); });

  const moved = sequenced.some((u, i) => u !== urls[i]);
  return NextResponse.json({
    photoUrls: sequenced,
    moved,
    matched: taken.size,
    total: urls.length,
    // Returned so the UI can say what it did rather than silently rearranging
    // the grid — see the button's toast.
    rooms: order,
  });
}
