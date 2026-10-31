// Checks for Send to Website's text builders (lib/website/send.ts).
// Run: node scripts/check-send-to-website.mjs
// lib/website/send.ts has no imports, so Node (22.18+) loads it directly.
import assert from "node:assert/strict";

const s = await import("../lib/website/send.ts");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok -", name); };

t("youtube link", () => {
  assert.equal(s.youtubeLink("AbC123xyz_-"), "https://youtu.be/AbC123xyz_-");
  assert.equal(s.youtubeLink("not a/id"), null);
  assert.equal(s.youtubeLink(null), null);
});

t("update message matches AutoSparks' Put on my Halo post", () => {
  const title = "What Makes Plymouth Meeting, PA So Connected?";
  const postUrl = "https://carmellathompson.com/blog/x/";
  const link = "https://youtu.be/AbC123xyz";
  assert.equal(s.haloUpdateMessage({ title, postUrl, link }), `Halo, add this video to the top of my post "${title}" (${postUrl}): ${link}`);
  assert.match(s.haloUpdateMessage({ title, postUrl }), /update my post .* Here it is:$/);
});

t("new post message", () => {
  assert.equal(s.haloNewMessage({ title: "T", link: "https://youtu.be/AbC123xyz", hasArticle: true }),
    `Halo, create a new blog post titled "T" with this video at the top: https://youtu.be/AbC123xyz. Here's the article:`);
  assert.equal(s.haloNewMessage({ title: "T", hasArticle: true }), `Halo, create a new blog post titled "T". Here's the article:`);
  assert.equal(s.haloNewMessage({ title: "T", link: "https://youtu.be/AbC123xyz", hasArticle: false }),
    `Halo, create a new blog post titled "T" with this video at the top: https://youtu.be/AbC123xyz.`);
});

t("sms link encodes the message", () => {
  assert.equal(s.haloSmsHref("+14157263224", "a & b"), "sms:+14157263224?&body=a%20%26%20b");
});

t("plain text drops heading markers", () => {
  assert.equal(s.articlePlainText(["Intro", "H2: Heading\nText", null, "  "]), "Intro\n\nHeading\nText");
});

t("video embed: YouTube first, then the file, else nothing", () => {
  assert.match(s.videoEmbedHtml({ youtubeId: "AbC123xyz", videoUrl: "https://x/v.mp4" }), /youtube\.com\/embed\/AbC123xyz/);
  assert.match(s.videoEmbedHtml({ videoUrl: "https://x/v.mp4" }), /<video controls[^>]*src="https:\/\/x\/v\.mp4"/);
  assert.equal(s.videoEmbedHtml({ videoUrl: "http://insecure/v.mp4" }), "");
  assert.match(s.videoEmbedHtml({ youtubeId: "AbC123xyz", title: 'a "q" <b>' }), /title="a &quot;q&quot; &lt;b&gt;"/);
});

t("video goes under the headline", () => {
  assert.equal(s.withVideo("<h1>H</h1>\n<p>x</p>", "<V>"), "<h1>H</h1>\n<V>\n<p>x</p>");
  assert.equal(s.withVideo("<p>x</p>", "<V>"), "<V>\n<p>x</p>");
  assert.equal(s.withVideo("", "<V>"), "<V>");
  assert.equal(s.withVideo("<p>x</p>", ""), "<p>x</p>");
});

t("marks to find the video on a page", () => {
  assert.deepEqual(s.videoMarks("AbC123xyz", "https://x/videos/abcdef123456.mp4?token=1"), ["AbC123xyz", "abcdef123456.mp4"]);
  assert.deepEqual(s.videoMarks(null, null), []);
});

t("post address cleaning", () => {
  assert.equal(s.cleanPostUrl("yoursite.com/blog/a"), "https://yoursite.com/blog/a");
  assert.equal(s.cleanPostUrl("javascript:alert(1)"), null);
  assert.equal(s.cleanPostUrl("not a url"), null);
  assert.equal(s.cleanPostUrl(""), null);
});

console.log(`\n${n} checks passed`);
