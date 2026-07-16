import { Card } from "@/components/ui/card";
import Link from "next/link";
import {
  Mic, Sparkles, Video, MonitorPlay, Wand2, PlayCircle,
  MapPin, User, Megaphone, Camera, Upload, Rocket,
} from "lucide-react";

export const metadata = { title: "How It Works — SparkReels" };

/* Placeholder block for the walkthrough videos being recorded — swap the
   inner content for a YouTube embed per section when they're ready. */
function VideoPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 bg-slate-50 border border-dashed border-slate-300 rounded-xl px-4 py-3 mt-4">
      <PlayCircle size={18} className="text-slate-400 shrink-0" />
      <p className="text-xs text-slate-400">
        <span className="font-semibold text-slate-500">{label} video walkthrough</span> — coming soon
      </p>
    </div>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span className="w-7 h-7 rounded-full bg-primary-500 text-white flex items-center justify-center text-xs font-bold shrink-0">
      {n}
    </span>
  );
}

function Step({ n, title, icon: Icon, children }: {
  n: number; title: string; icon: React.ElementType; children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <StepNumber n={n} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-brand-text flex items-center gap-1.5">
          <Icon size={14} className="text-primary-500" /> {title}
        </p>
        <div className="text-sm text-slate-600 leading-relaxed mt-1">{children}</div>
      </div>
    </div>
  );
}

export default function HelpPage() {
  return (
    <div className="max-w-3xl mx-auto">
      {/* Hero */}
      <div className="mb-6 p-6 rounded-2xl bg-gradient-to-br from-primary-500 to-orange-400 text-white">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
            <Rocket size={18} />
          </div>
          <h1 className="text-xl font-bold">How It Works</h1>
        </div>
        <p className="text-sm text-white/85">
          From blank account to published video — set up once, then every video takes about 5 minutes of your time.
        </p>
      </div>

      <div className="flex flex-col gap-5">

        {/* ── PART 1 ── */}
        <Card padding="sm">
          <p className="text-xs font-bold text-primary-600 uppercase tracking-wide mb-1">Part 1 · One-Time Setup</p>
          <h2 className="text-base font-bold text-brand-text mb-4">Set Up Once (~10 Minutes)</h2>
          <div className="flex flex-col gap-4">
            <Step n={1} title="Complete Your Brand Profile" icon={User}>
              In <Link href="/settings" className="text-primary-600 font-medium hover:underline">Settings → Brand &amp; AI Profile</Link>, add
              your name, brokerage, phones, website, and license number. Upload your <strong>logo</strong> and
              your <strong>headshot</strong> — the headshot becomes your AI Photo Avatar, and your contact card
              and logo appear automatically in every video.
            </Step>
            <Step n={2} title="Set Your Market" icon={MapPin}>
              In <strong>Settings → Content Preferences</strong>, enter your city, state, and video language.
              This powers live local market research, trending topics, and auto-localized templates.
            </Step>
            <Step n={3} title="Create Your AI Voice" icon={Mic}>
              In <strong>Settings → AI Voice Clone</strong>, record or upload 1–2 minutes of your voice.
              Your AI videos will speak in <em>your</em> voice.
            </Step>
            <Step n={4} title="Train Your Digital Twin (Optional, Recommended)" icon={Video}>
              Record a short video of yourself following the prompts and approve the consent step. Your
              Digital Twin is a photorealistic moving avatar of you — the most natural-looking presenter option.
            </Step>
            <Step n={5} title="Set Your Default Video CTA" icon={Megaphone}>
              In <strong>Settings → Default Video CTA</strong>, add your years in real estate and review the
              pre-written closing call-to-action. It auto-fills your name, team, and <em>each video&apos;s</em> city —
              edit it once and every video ends with a proven subscribe-and-contact close.
            </Step>
            <Step n={6} title="Connect YouTube" icon={MonitorPlay}>
              In <Link href="/settings/social" className="text-primary-600 font-medium hover:underline">Settings → Social Accounts</Link>,
              connect the Google account that owns your channel. One-time tip: verify your account by phone at
              youtube.com/verify so videos up to 15 minutes always upload smoothly.
            </Step>
          </div>
          <VideoPlaceholder label="Getting Set Up" />
        </Card>

        {/* ── PART 2 ── */}
        <Card padding="sm">
          <p className="text-xs font-bold text-primary-600 uppercase tracking-wide mb-1">Part 2 · Creating A Video</p>
          <h2 className="text-base font-bold text-brand-text mb-3">Four Ways To Create</h2>

          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 uppercase tracking-wide">
                  <th className="pb-2 pr-3 font-semibold">Mode</th>
                  <th className="pb-2 pr-3 font-semibold">Best For</th>
                  <th className="pb-2 font-semibold">Cost</th>
                </tr>
              </thead>
              <tbody className="text-slate-600">
                <tr className="border-t border-slate-100">
                  <td className="py-2 pr-3 font-semibold text-brand-text whitespace-nowrap">AI Writes It</td>
                  <td className="py-2 pr-3">You have a topic — AI does the rest</td>
                  <td className="py-2 whitespace-nowrap">1 credit (6 long-form)</td>
                </tr>
                <tr className="border-t border-slate-100">
                  <td className="py-2 pr-3 font-semibold text-brand-text whitespace-nowrap">Paste / Upload</td>
                  <td className="py-2 pr-3">You already have a script, docs, or photos</td>
                  <td className="py-2 whitespace-nowrap">1 credit (6 long-form)</td>
                </tr>
                <tr className="border-t border-slate-100">
                  <td className="py-2 pr-3 font-semibold text-brand-text whitespace-nowrap">My Listing</td>
                  <td className="py-2 pr-3">Turn a listing into a video</td>
                  <td className="py-2 whitespace-nowrap">1 credit</td>
                </tr>
                <tr className="border-t border-slate-100">
                  <td className="py-2 pr-3 font-semibold text-brand-text whitespace-nowrap">Use Camera</td>
                  <td className="py-2 pr-3">Film yourself with the teleprompter</td>
                  <td className="py-2 whitespace-nowrap font-semibold text-green-600">FREE, unlimited</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-4">
            <Step n={7} title="AI Writes It — The Main Flow" icon={Sparkles}>
              On <Link href="/create" className="text-primary-600 font-medium hover:underline">Create Video</Link>:
              confirm your <strong>market</strong>, then set your <strong>topic</strong> — type it, speak it with
              the mic, tap a <strong>Trending Radar</strong> suggestion, or tap a <strong>Template</strong> (Real
              Estate Tips, vlogs, listicles, pros &amp; cons, map videos, home tours — your city auto-fills).
              Click <strong>Generate My Script</strong> and AI researches live market data for your city and
              writes a broadcast-quality script with real stats.
            </Step>
            <Step n={8} title="Review & Edit The Script" icon={Wand2}>
              Pick your favorite <strong>hook</strong>, edit the script freely, and review the
              <strong> Call To Action</strong> (pre-filled with your default CTA, localized to this video&apos;s
              city). Your <strong>title, description &amp; hashtags</strong> are already generated below the script.
            </Step>
            <Step n={9} title="Choose Format, Style & Avatar — Then Generate" icon={Video}>
              Pick a <strong>format</strong>: YouTube/Blog (16:9, ~2 min · 1 credit), Reel (9:16, ~1 min · 1 credit),
              or <strong>Long-Form YouTube</strong> (8–10 min, unlocks mid-roll ads · 6 credits — included with Pro
              or via the $39 Long-Form pack). Pick a <strong>style</strong> (Voice Only or Avatar + Voice), choose
              your avatar look, optionally attach photos or documents as b-roll, and hit <strong>Generate</strong>.
              Rendering takes a few minutes — watch it in My Videos. If a render ever fails, your credits are
              refunded automatically.
            </Step>
            <Step n={10} title="Use Camera — The Free Option" icon={Camera}>
              Write or Spark your script, tap <strong>Add Channel CTA</strong> to append your closing pitch, then
              open the camera — the <strong>teleprompter scrolls automatically</strong> while you record in up to
              1080p/60fps. Record up to <strong>15 minutes</strong> (8–15 min is YouTube&apos;s algorithm sweet spot
              and unlocks mid-roll ads). Follow the on-screen Tips For Best Video for lighting and framing.
            </Step>
          </div>
          <VideoPlaceholder label="Creating A Video" />
        </Card>

        {/* ── PART 3 ── */}
        <Card padding="sm">
          <p className="text-xs font-bold text-primary-600 uppercase tracking-wide mb-1">Part 3 · Publish</p>
          <h2 className="text-base font-bold text-brand-text mb-4">Get It In Front Of People</h2>
          <div className="flex flex-col gap-4">
            <Step n={11} title="Publish To YouTube — One Click" icon={MonitorPlay}>
              Open the finished video in <Link href="/videos" className="text-primary-600 font-medium hover:underline">My Videos</Link> and
              hit <strong>Publish</strong>. Your AI-generated title, description, and hashtags are attached
              automatically — choose public, unlisted, or private, and you&apos;re live without leaving the app.
            </Step>
            <Step n={12} title="Everywhere Else" icon={Upload}>
              Download the MP4 for Instagram, Facebook, and LinkedIn — and grab the pre-written
              <strong> Instagram caption, LinkedIn post, and email blurb</strong> from the project&apos;s
              Title, Description &amp; Hashtags card.
            </Step>
          </div>
          <VideoPlaceholder label="Publishing" />
        </Card>

        {/* ── PART 4 ── */}
        <Card padding="sm">
          <p className="text-xs font-bold text-primary-600 uppercase tracking-wide mb-1">Part 4 · The AI Tools Workbench</p>
          <h2 className="text-base font-bold text-brand-text mb-2">Iterate &amp; Improve</h2>
          <p className="text-sm text-slate-600 leading-relaxed mb-3">
            You don&apos;t need <Link href="/tools" className="text-primary-600 font-medium hover:underline">AI Tools</Link> to
            make a video — Create Video generates everything automatically. Use the tools to iterate: brainstorm
            8 title angles before committing, draft and compare scripts without creating projects, regenerate a
            description or 20 fresh tags for any video (including older ones), and name your channel (one-time).
          </p>
          <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5">
            💡 Tip: from any project&apos;s <strong>Title, Description &amp; Hashtags</strong> card, tap
            <strong> &ldquo;Improve With AI Tools&rdquo;</strong> — it opens the right tool with that project already loaded.
          </p>
          <VideoPlaceholder label="AI Tools" />
        </Card>

        {/* ── Quick reference ── */}
        <Card padding="sm" className="bg-gradient-to-br from-slate-50 to-white">
          <h2 className="text-base font-bold text-brand-text mb-3">The Weekly Rhythm</h2>
          <ol className="text-sm text-slate-600 leading-relaxed space-y-1.5 list-decimal pl-5">
            <li><strong>Once:</strong> set up your profile, voice, avatar, CTA, and YouTube (Part 1)</li>
            <li><strong>Weekly:</strong> pick a template or trending topic → generate script → generate video — about 5 minutes of your time</li>
            <li><strong>Publish:</strong> one click to YouTube with title, description, and tags attached</li>
            <li><strong>Mix in</strong> free camera videos — YouTube&apos;s algorithm loves 8–15 minute authentic long-form</li>
          </ol>
          <Link
            href="/create"
            className="inline-flex items-center gap-2 mt-4 px-4 py-2.5 bg-primary-500 hover:bg-primary-600 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            <Sparkles size={15} /> Create Your First Video
          </Link>
        </Card>

      </div>
    </div>
  );
}
