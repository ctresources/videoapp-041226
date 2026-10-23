/**
 * Writes the three free-video follow-up emails to one HTML page so the owner
 * can read them as sent. Run: npx tsx scripts/preview-free-followups.ts <out.html>
 */
import { writeFileSync } from "fs";
import { buildFreeFollowupEmail } from "../lib/email";

const out = process.argv[2] || "free-followups-preview.html";
const days = { 1: 2, 2: 5, 3: 10 } as const;
const sections = ([1, 2, 3] as const).map((step) => {
  const e = buildFreeFollowupEmail({ name: "Jamie Rivera", city: "Springfield", step, unsubscribeUrl: "https://www.sparkreels.ai/api/public/unsubscribe?t=example" });
  return `
  <section style="max-width:680px;margin:0 auto 40px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
    <div style="background:#f1f5f9;padding:14px 20px;font-family:Arial,sans-serif;font-size:13px;color:#475569;line-height:1.7">
      <strong style="color:#0f172a">Email ${step}</strong> &middot; day ${days[step]} after signup<br>
      <strong>From:</strong> Carmella at SparkReels &lt;support@sparkreels.ai&gt;<br>
      <strong>Subject:</strong> ${e.subject}
    </div>
    <div style="padding:8px 20px 20px">${e.html}</div>
  </section>`;
}).join("");

writeFileSync(out, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Free follow-up emails</title></head>
<body style="background:#e2e8f0;margin:0;padding:32px 16px">
<p style="max-width:680px;margin:0 auto 20px;font-family:Arial,sans-serif;color:#334155;font-size:14px">Preview with a sample agent, <strong>Jamie Rivera</strong> in <strong>Springfield</strong>. Each email shows their own first name and city. If they haven't set a city, Email 2 says "your market" / "your area".</p>
${sections}
</body></html>`);
console.log("wrote", out);
