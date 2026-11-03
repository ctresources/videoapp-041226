// Makes a template's source video through the API (studio mode), written with
// real sample values so each one can later become a variable. The look is
// finished in HeyGen's editor (on-screen words), then promoted to a template.
//
//   node scripts/templates/make-source.mjs <spec.json>
import fs from "fs";

const spec = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
  .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
const H = { "x-api-key": env.HEYGEN_API_KEY, "Content-Type": "application/json" };

const scenes = spec.scenes.map((s) => s.kind === "avatar"
  ? {
      type: "avatar_video",
      input: {
        type: "avatar", avatar_id: spec.avatar, voice_id: spec.voice, script: s.say, engine: { type: "avatar_iii" },
        remove_background: true, background: { type: "image", source: { type: "url", url: s.photo } },
      },
    }
  : {
      type: "image",
      source: { type: "url", url: s.photo },
      script: s.say, voice_id: spec.voice,
    });

const res = await fetch("https://api.heygen.com/v3/videos", {
  method: "POST", headers: H,
  body: JSON.stringify({ type: "studio", title: spec.title, aspect_ratio: spec.aspect ?? "16:9", resolution: "1080p", scenes }),
});
const text = await res.text();
console.log(res.status, text.slice(0, 400));
