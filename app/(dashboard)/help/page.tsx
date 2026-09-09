import { Card } from "@/components/ui/card";
import Link from "next/link";
import {
  Mic, Sparkles, Video, MonitorPlay, Wand2, PlayCircle, FileText,
  MapPin, User, Megaphone, Camera, Upload, Rocket, Bot,
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
      <div className="mb-6 p-6 rounded-2xl spark-banner-gradient text-white">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
            <Rocket size={18} />
          </div>
          <h1 className="text-xl font-bold text-spark-ink">How It Works</h1>
        </div>
        <p className="text-sm text-primary-100">
          From blank account to published video — set up once, then every video takes about 5 minutes of your time. Or skip the video entirely and just write the blog post.
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
              In <strong>Settings → AI Voice Clone</strong>, record or upload about 30 seconds of your voice.
              Your AI videos will speak in <em>your</em> voice.
            </Step>
            {/* The Digital Twin step is gone rather than reworded: training one
                per customer needs HeyGen's Enterprise API, so a setup guide
                recommending it was walking people towards a door that does not
                open. The photo avatar it falls back to is set up in step 1. */}
            <Step n={4} title="Set Your Default Video CTA" icon={Megaphone}>
              In <strong>Settings → Default Video CTA</strong>, add your years in real estate and review the
              pre-written closing call-to-action. It auto-fills your name, team, and <em>each video&apos;s</em> city —
              edit it once and every video ends with a proven subscribe-and-contact close.
            </Step>
            <Step n={5} title="Connect YouTube" icon={MonitorPlay}>
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
          <h2 className="text-base font-bold text-brand-text mb-3">Ways To Create</h2>

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
                  <td className="py-2 pr-3 font-semibold text-brand-text whitespace-nowrap">Film On Camera</td>
                  <td className="py-2 pr-3">Film yourself with the teleprompter</td>
                  <td className="py-2 whitespace-nowrap font-semibold text-green-600">FREE, unlimited*</td>
                </tr>
                <tr className="border-t border-slate-100">
                  <td className="py-2 pr-3 font-semibold text-brand-text whitespace-nowrap">Blog post</td>
                  <td className="py-2 pr-3">Words for your own site — no video made at all</td>
                  <td className="py-2 whitespace-nowrap font-semibold text-green-600">FREE, unlimited*</td>
                </tr>
                <tr className="border-t border-slate-100">
                  <td className="py-2 pr-3 font-semibold text-brand-text whitespace-nowrap">AI writes it</td>
                  <td className="py-2 pr-3">You have a topic — AI does the rest</td>
                  <td className="py-2 whitespace-nowrap">1 short video</td>
                </tr>
                <tr className="border-t border-slate-100">
                  <td className="py-2 pr-3 font-semibold text-brand-text whitespace-nowrap">Paste my script</td>
                  <td className="py-2 pr-3">You already have the words — spoken exactly as written</td>
                  <td className="py-2 whitespace-nowrap">1 short video</td>
                </tr>
                <tr className="border-t border-slate-100">
                  <td className="py-2 pr-3 font-semibold text-brand-text whitespace-nowrap">My listings/My photos</td>
                  <td className="py-2 pr-3">A scripted listing tour</td>
                  <td className="py-2 whitespace-nowrap">1 short video</td>
                </tr>
                <tr className="border-t border-slate-100">
                  <td className="py-2 pr-3 font-semibold text-brand-text whitespace-nowrap">Photo reel</td>
                  <td className="py-2 pr-3">Your photos, Ken Burns and a music bed</td>
                  <td className="py-2 whitespace-nowrap font-semibold text-green-600">FREE</td>
                </tr>
              </tbody>
            </table>
            <p className="text-xs text-slate-400 mt-1.5">
              * Unlimited on any paid plan. On the free 100-agent beta, camera recording, blog posts and every AI Tool are unlimited for 30 days starting the day you generate your free video.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <Step n={6} title="Three Questions, Then It Writes" icon={Sparkles}>
              <Link href="/create" className="text-primary-600 font-medium hover:underline">Create</Link>{" "}
              asks three things in order. <strong>1 · What are you sparking?</strong> —{" "}
              <strong>Use My Avatar</strong>, <strong>Film On Camera</strong> or{" "}
              <strong>Blog post</strong>. <strong>2 · Where should the script begin?</strong> — a
              topic, your own pasted words, or a listing. <strong>3 · What is it about?</strong>
            </Step>
            <Step n={7} title="Speak It Or Type It — Your Choice" icon={Mic}>
              Speaking it is a real conversation: click the mic (or, on desktop, hold{" "}
              <span className="spark-cta-gradient rounded px-1.5 py-0.5 text-xs font-semibold text-white">Spacebar</span>{" "}
              anywhere on the page) and just talk — your city, the topic, who it&apos;s for, the
              tone, how long. It fills in whatever it catches and asks a quick follow-up for anything missing,
              then say <strong>&ldquo;SparkReels&rdquo;</strong> — or just say you&apos;re ready — and it writes
              the script. Prefer typing, or want a suggestion instead of a blank field? Every topic
              is a chip under the box — twenty-five of them in three groups (Real estate tips,
              Formats, Local events &amp; community), your city filled in automatically. Tap one and
              it lands in the same box the mic writes into, so you can add to it before you send.
              Either way, AI researches live market data for your city and writes a
              broadcast-quality script with real stats.
            </Step>
            <Step n={8} title="Review & Edit The Script" icon={Wand2}>
              Pick your favorite <strong>hook</strong> — it becomes the video title too, so the two never
              disagree. Edit the script freely; a live word counter keeps you inside the cap. Set your{" "}
              <strong>Call To Action</strong>, or choose <strong>None</strong> if this one shouldn&apos;t ask
              for anything. <strong>Regenerate</strong> redoes it from the same topic — it asks first, since
              it discards your edits.
            </Step>
            <Step n={9} title="Choose Format, Style & Avatar — Then Generate" icon={Video}>
              Pick a <strong>format</strong>: <strong>Vertical 9:16</strong> for Reels, Shorts and TikTok, or{" "}
              <strong>Horizontal 16:9</strong> for YouTube and websites — both up to 3 minutes with automatic
              b-roll — or <strong>Longform 16:9</strong> (up to 8 minutes, using your own photos for visuals;
              long videos have their own monthly allowance — 2 with Producer, 4 with Influencer — or $49 on its own).
              Then <strong>who&apos;s on screen</strong>: Voice only, Avatar + voice, or <strong>I&apos;ll record
              it</strong>, which is the free way out of this screen — it hands your script and photos to the
              camera instead of rendering. Attach photos or documents as b-roll, and hit{" "}
              <strong>Spark Video</strong>. Rendering time follows the length of the <em>script</em>, not the
              format — typically <strong>5–20 minutes</strong> for a short video, and up to an hour for a long
              one. You can close the page and watch for it in My Content. If a render ever fails, your
              allowance is refunded automatically.
            </Step>
            <Step n={10} title="Use Camera — The Free Option" icon={Camera}>
              The camera screen is two halves. <strong>What we&apos;re writing</strong> comes first — your
              market, how long the script should be, and where the words come from: a topic, a PDF or link, a
              recording of you talking, your own typing, or <strong>Speak naturally</strong>, which is no
              script and no teleprompter at all. Then <strong>how it records</strong> — vertical or horizontal,
              Branded Look, your photos playing behind you, and <strong>Add Channel CTA</strong> to append your
              closing pitch. You can also skip straight here with <strong>Record on Camera</strong>, a
              one-click button on any script or blog post. The <strong>teleprompter scrolls automatically</strong>{" "}
              while you record in up to 1080p/60fps, for up to <strong>15 minutes</strong> (8–15 min is
              YouTube&apos;s algorithm sweet spot and unlocks mid-roll ads).
            </Step>
            <Step n={11} title="Your Share Kit — And A Blog Post" icon={FileText}>
              Every video finishes on its <strong>Share Kit</strong>: the title, description and hashtags
              Publish fills in for you, plus an Instagram caption, a LinkedIn post and an email blurb. It also
              holds a <strong>blog article</strong> — around a thousand words, headings written as the
              questions people actually ask and answered in the first line, which is the shape an AI assistant
              quotes. <strong>Copy as HTML</strong> drops it into your website. An AI can&apos;t quote your
              video; it can quote your page. Blog posts never use a video from your plan, and you can write one
              without making a video at all — pick <strong>Blog post</strong> on the first question.
            </Step>
          </div>
          <VideoPlaceholder label="Creating A Video" />
        </Card>

        {/* ── PART 3 ── */}
        <Card padding="sm">
          <p className="text-xs font-bold text-primary-600 uppercase tracking-wide mb-1">Part 3 · Publish</p>
          <h2 className="text-base font-bold text-brand-text mb-4">Get It In Front Of People</h2>
          <div className="flex flex-col gap-4">
            <Step n={12} title="Publish To YouTube — One Click" icon={MonitorPlay}>
              Open the finished video in <Link href="/videos" className="text-primary-600 font-medium hover:underline">My Content</Link> and
              hit <strong>Publish</strong>. Your AI-generated title, description, and hashtags are attached
              automatically — choose public, unlisted, or private, and you&apos;re live without leaving the app.
            </Step>
            <Step n={13} title="Everywhere Else" icon={Upload}>
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
          <h2 className="text-base font-bold text-brand-text mb-3">Iterate &amp; Improve</h2>
          <div className="flex flex-col gap-4">
            <Step n={14} title="The Everyday Tools" icon={Wand2}>
              You don&apos;t need <Link href="/tools" className="text-primary-600 font-medium hover:underline">AI Tools</Link> to
              make a video — Create generates everything automatically. Use these to iterate: brainstorm
              8 title angles before committing, draft and compare scripts without creating projects, regenerate a
              description or 20 fresh tags for any video (including older ones), and name your channel (one-time).
              From any project&apos;s <strong>Title, Description &amp; Hashtags</strong> card, tap{" "}
              <strong>&ldquo;Improve With AI Tools&rdquo;</strong> and it opens the right tool with that project
              already loaded.
            </Step>
            <Step n={15} title="AI Answer Blocks — Get Cited By AI Search" icon={Bot}>
              Buyers ask ChatGPT and Perplexity things like &ldquo;which neighborhood should I buy in?&rdquo;
              months before they call an agent. This tool researches what they&apos;re actually asking in{" "}
              <em>your</em> market and gives you two ways to answer each question: a <strong>video topic</strong> you
              can record right now — including a <strong>Record on Camera</strong> shortcut straight to the
              teleprompter — and a ready-to-paste <strong>text block</strong> for your website, written the way
              AI assistants extract and cite answers.
            </Step>
          </div>
          <VideoPlaceholder label="AI Tools" />
        </Card>

        {/* ── Quick reference ── */}
        <Card padding="sm" className="bg-gradient-to-br from-slate-50 to-white">
          <h2 className="text-base font-bold text-brand-text mb-3">The Weekly Rhythm</h2>
          <ol className="text-sm text-slate-600 leading-relaxed space-y-1.5 list-decimal pl-5">
            <li><strong>Once:</strong> set up your profile, voice, avatar, CTA, and YouTube (Part 1)</li>
            <li><strong>Weekly:</strong> tap a topic chip → generate script → Spark Video — about 5 minutes of your time</li>
            <li><strong>Publish:</strong> one click to YouTube with title, description, and tags attached</li>
            <li><strong>Mix in</strong> free camera videos — YouTube&apos;s algorithm loves 8–15 minute authentic long-form</li>
            <li><strong>Every one</strong> also gives you a blog article for your own site, which costs nothing from your plan</li>
          </ol>
          <Link
            href="/create"
            className="inline-flex items-center gap-2 mt-4 px-4 py-2.5 spark-cta-gradient text-white text-sm font-semibold rounded-xl"
          >
            <Sparkles size={15} /> Create Your First Video
          </Link>
        </Card>

      </div>
    </div>
  );
}
