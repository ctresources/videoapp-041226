import Link from "next/link";

/**
 * Home page: making videos from Claude or ChatGPT over MCP (2026-11-23, the
 * owner's approved mockup: docs/mockups/ai-connections-website-settings.html).
 * Only the assistants that have passed a real test are named here.
 */
const STEPS = [
  { title: "Connect SparkReels", text: "Add it to Claude or ChatGPT once." },
  { title: "Ask for a video", text: "Say what you want in your own words." },
  { title: "Approve the plan", text: "Your script, video and Share Kit are made in SparkReels." },
  { title: "Confirm to post", text: "Nothing posts until you say so." },
];

const PLAN = [
  "Write the script",
  "Make the video: Wide, your Digital Twin, Full AI Avatar",
  "Write the Share Kit",
  "Post to YouTube (you confirm when the video is ready)",
];

export function AiAssistantsSection() {
  return (
    <section id="ai-assistants" className="scroll-mt-20 border-b border-slate-200 bg-white px-4 py-12 sm:px-6 sm:py-14">
      <div className="mx-auto max-w-[1600px]">
        <div className="mb-8">
          <p className="mb-3 text-lg font-bold uppercase tracking-widest text-[#A3660F]">Works With Your AI</p>
          <h2 className="mb-3 text-4xl font-black text-slate-900">Make videos from Claude or ChatGPT</h2>
          <p className="text-slate-500">Ask in your AI app. Approve the plan. SparkReels makes it.</p>
        </div>

        <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
            <span className="mb-5 self-start rounded-full bg-[#BA7517] px-3 py-0.5 text-sm font-semibold text-white">Paid plans</span>
            <ol className="mb-7 grid gap-5">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex gap-3.5">
                  <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[#fbf3e4] text-base font-extrabold text-[#A3660F]">{i + 1}</span>
                  <span>
                    <span className="block text-xl font-bold leading-snug text-slate-900">{s.title}</span>
                    <span className="block text-lg text-slate-500">{s.text}</span>
                  </span>
                </li>
              ))}
            </ol>
            <div className="mt-auto flex flex-wrap gap-2.5">
              <Link href="/pricing" className="inline-flex min-h-[46px] items-center justify-center rounded-xl bg-spark-amber px-5 py-2 text-lg font-bold text-white transition-colors hover:bg-[#A3660F]">
                See Plans
              </Link>
              <Link href="/settings#ai-connections" className="inline-flex min-h-[46px] items-center justify-center rounded-xl border-[1.5px] border-spark-amber bg-white px-5 py-2 text-lg font-bold text-[#A3660F] transition-colors hover:bg-[#fbf3e4]">
                How to connect
              </Link>
            </div>
          </div>

          {/* A picture of the chat, so its buttons are plain labels. */}
          <div className="flex min-w-0 flex-col rounded-2xl bg-[#1f1d1a] p-5 text-[#f5f2ea] sm:p-7" role="img" aria-label="A chat asking for a video, answered with a Recommended Spark Plan to approve, edit or cancel">
            <div className="mb-4 max-w-[88%] self-end rounded-2xl rounded-br bg-[#3a362f] px-4 py-3 text-lg">
              Plan a wide video about the Blue Bell market with my Digital Twin.
            </div>
            <div className="flex flex-1 flex-col rounded-xl border border-[#47423a] bg-[#292621] p-4 sm:p-5">
              <p className="mb-3 text-xl font-bold text-white">Recommended Spark Plan</p>
              <ol className="mb-5 list-decimal space-y-1.5 pl-6 text-lg text-[#ded9cd]">
                {PLAN.map((p) => <li key={p}>{p}</li>)}
              </ol>
              <div className="mt-auto flex flex-wrap gap-2">
                <span className="inline-flex min-h-[42px] items-center rounded-xl bg-spark-amber px-4 text-base font-bold text-white">Approve Plan</span>
                <span className="inline-flex min-h-[42px] items-center rounded-xl border border-[#6a6355] px-4 text-base font-bold">Edit Plan</span>
                <span className="inline-flex min-h-[42px] items-center rounded-xl border border-[#6a6355] px-4 text-base font-bold">Cancel</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
