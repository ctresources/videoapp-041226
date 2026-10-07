import { Card } from "@/components/ui/card";
import Link from "next/link";
import {
  Mic, Sparkles, Video, MonitorPlay, Wand2, PlayCircle, FileText,
  MapPin, User, Megaphone, Camera, Upload, Rocket, Bot,
  LayoutDashboard, BarChart2, CalendarDays, Mail, Image as ImageIcon,
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
          {/* "Or skip the video entirely" made the video sound like the chore
              you get to avoid, on a page about making videos. The capability
              is worth naming; the framing is additive now. */}
          From blank account to published video — set up once, then every video takes about 5 minutes of your time. You can also write just the blog post, with no video at all.
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
            {/* Setup rather than creating, because the useful half is done once:
                saving the address. After that it is a Forward button in whatever
                mail app you already live in. */}
            <Step n={6} title="Save Your Import Address" icon={Mail}>
              In <Link href="/settings" className="text-primary-600 font-medium hover:underline">Settings → Import Articles By Email</Link>{" "}
              you have a private address that looks like{" "}
              <strong>yourname-k7m3qz@in.sparkreels.ai</strong>. Forward anything to it — a newsletter, a
              market report, an article someone sent you, or a post you wrote yourself — and it appears
              inside SparkReels within a minute, with the signatures, forwarding headers and unsubscribe
              footers already stripped out. Press <strong>Email this address to me</strong> and save it to
              your contacts; after that, forwarding is the whole of it.
              <span className="block mt-1.5">
                It is private to your account, so treat it like a password. Anyone who has it can send
                articles into your list, and you can replace it any time from the same screen.
              </span>
              {/* Where it turns up. The address was explained and the arrival
                  was not: the only sign an email had landed was a list four
                  taps into a route. */}
              <span className="block mt-1.5">
                Once something has arrived, the top of{" "}
                <Link href="/create" className="text-primary-600 font-medium hover:underline">Spark Studio</Link>{" "}
                says so, in a line under the four cards such as{" "}
                <strong>Imported content: 2 new emails</strong>. Open it and
                each email has <strong>Make a blog</strong> and <strong>Make a video</strong>, which set
                that up with the email already attached. Nothing is written until you press the button at
                the bottom of the page. The whole piece is read, up to about 10,000 words, so a long market
                report is used to its last page. Forwarded emails are kept for 30 days.
              </span>
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
                  <td className="py-2 pr-3 font-semibold text-brand-text whitespace-nowrap">Record yourself</td>
                  <td className="py-2 pr-3">Film yourself with the teleprompter</td>
                  <td className="py-2 whitespace-nowrap font-semibold text-green-600">FREE, unlimited*</td>
                </tr>
                <tr className="border-t border-slate-100">
                  <td className="py-2 pr-3 font-semibold text-brand-text whitespace-nowrap">Blog</td>
                  <td className="py-2 pr-3">Words for your own site — no video made at all</td>
                  <td className="py-2 whitespace-nowrap font-semibold text-green-600">FREE, unlimited*</td>
                </tr>
                <tr className="border-t border-slate-100">
                  <td className="py-2 pr-3 font-semibold text-brand-text whitespace-nowrap">Avatar video · AI writes it</td>
                  <td className="py-2 pr-3">You have a topic — AI does the rest</td>
                  <td className="py-2 whitespace-nowrap">1 short video</td>
                </tr>
                {/* One row where there were three (Paste my script, Shorten my
                    article, Something you already have), because the app now
                    has one card for all of it. */}
                <tr className="border-t border-slate-100">
                  <td className="py-2 pr-3 font-semibold text-brand-text whitespace-nowrap">Use my content</td>
                  <td className="py-2 pr-3">
                    A finished script spoken exactly as written — or an article, a PDF, a link or a
                    forwarded email that AI writes from
                  </td>
                  <td className="py-2 whitespace-nowrap">
                    <span className="font-semibold text-green-600">FREE as a blog*</span>
                    <br />
                    1 short video as a video
                  </td>
                </tr>
                <tr className="border-t border-slate-100">
                  <td className="py-2 pr-3 font-semibold text-brand-text whitespace-nowrap">Listing video</td>
                  <td className="py-2 pr-3">A scripted tour, written from the listing</td>
                  <td className="py-2 whitespace-nowrap">1 short video</td>
                </tr>
                <tr className="border-t border-slate-100">
                  <td className="py-2 pr-3 font-semibold text-brand-text whitespace-nowrap">Photos only reel · Classic</td>
                  <td className="py-2 pr-3">Your photos with a slow pan across each, and music or your voice</td>
                  <td className="py-2 whitespace-nowrap font-semibold text-green-600">FREE</td>
                </tr>
                <tr className="border-t border-slate-100">
                  <td className="py-2 pr-3 font-semibold text-brand-text whitespace-nowrap">Photos only reel · Cinematic</td>
                  <td className="py-2 pr-3">Each photo becomes a few seconds of real camera movement</td>
                  <td className="py-2 whitespace-nowrap">1 short video</td>
                </tr>
              </tbody>
            </table>
            <p className="text-xs text-slate-400 mt-1.5">
              * Unlimited on any paid plan. On the free 100-agent beta, camera recording, blog posts and every AI Tool are unlimited for 30 days starting the day you generate your free video.
              {" "}Before that video, you get <strong>2 free tries</strong> of the AI Tools and{" "}
              <strong>2 free AI images</strong> to see how they work — one try per tool run.
              Making the video is free and lifts both limits.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <Step n={7} title="Three Questions, Then It Writes" icon={Sparkles}>
              <Link href="/create" className="text-primary-600 font-medium hover:underline">Spark Studio</Link>{" "}
              asks up to three things in order. <strong>1 · What are you sparking?</strong> — four
              cards: <strong>Avatar video</strong>, <strong>Record yourself</strong>,{" "}
              <strong>Blog</strong> or <strong>Listings &amp; photos</strong>.{" "}
              <strong>2 · How should your script begin?</strong> — <strong>AI writes it</strong> from
              a topic, or <strong>Use my content</strong>. A listing or a photos only reel
              skips this one (step 12). <strong>3 · What is it about?</strong>
              {/* Sparks are named here because everything below refers to them,
                  and because one now exists the moment a project does — someone
                  who saves an idea and leaves will find it waiting. */}
              <span className="block mt-1.5">
                Whatever you pick, it starts a <strong>Spark</strong> — the folder holding that
                topic&apos;s script, its videos, its article and where they&apos;ve been published.
                It&apos;s created the moment you begin, so an idea saved and left half-finished is
                still there marked <strong>Draft</strong>, not lost. Part 5 explains where Sparks
                live and how they differ from the videos themselves.
              </span>
              {/* The way in for people who did not start from nothing, which is
                  most people with an existing blog. */}
              <span className="block mt-1.5">
                <strong>Already written it?</strong>{" "}
                <strong>Use my content</strong> is the one place for it, the second
                tile on question 2. Paste your words in, or attach a PDF, a link, or an email you
                forwarded to your import address (step 6). On a video you then say what happens to
                them: <strong>Speak it word for word</strong>, for a finished script, or{" "}
                <strong>Have AI write from it</strong>, which either writes a new script from it or
                shortens an article of your own. The script comes back for you to read before
                anything is made. If an email&apos;s subject names a town, the city and state fill in
                for you. Recording yourself has its own version of this, <strong>From a document</strong>.
              </span>
              <span className="block mt-1.5">
                On the <strong>Blog</strong> route the same tile is there, and you choose
                what happens to it: <strong>Use it as it is</strong>, which publishes your words
                unchanged and takes seconds, or <strong>Write a new article from it</strong>, which
                covers the same ground in your voice for your market. Use the first for your own
                writing and the second for someone else&apos;s — a newsletter another person wrote
                is theirs, not yours to publish. A market report is the second kind: it is a data
                provider&apos;s pages of listings, so have a new article written from it rather than
                publishing it as it stands.
              </span>
              {/* The brief. Three pickers that shape everything written
                  afterwards and were not mentioned anywhere on this page. */}
              <span className="block mt-1.5">
                <strong>Who is it for?</strong> <strong>Audience</strong>, <strong>Tone</strong> and{" "}
                <strong>Why</strong> are three optional pickers beside the topic. What
                you choose shapes the script, the article and the Spark Tools afterwards. If your
                audience is not on the list — first responders, nurses relocating — choose{" "}
                <strong>Add your own&hellip;</strong> at the bottom of Audience and type it. It is saved
                to your account, so it is there on your phone and your computer, and choosing it again
                shows <strong>Remove from my list</strong> for when you no longer want it.
              </span>
            </Step>
            <Step n={8} title="Speak It Or Type It — Your Choice" icon={Mic}>
              {/* The mic at the top first: signing in lands on it, and one
                  sentence there answers all three questions above. Example
                  towns are generic on purpose. */}
              The quickest way in is the mic card at the top of Spark Studio,{" "}
              <strong>Speak what you want to create</strong>. Tap the mic and say the whole thing in
              one sentence —{" "}
              <em>&ldquo;Create a blog for downsizers about one-floor living in Springfield&rdquo;</em> or{" "}
              <em>&ldquo;Make a short YouTube video with my avatar and voice about the Riverside
              market&rdquo;</em> — and it takes the route, the town, the topic and who it&apos;s for from
              what you said. A blog is written straight away. A video stops at its script, so nothing
              comes out of your plan until you choose to render it. If something is missing it asks, and
              you tap the mic again to answer.
              <span className="block mt-1.5">
                You can start from an email you forwarded the same way:{" "}
                <em>&ldquo;Create a blog from my Springfield market report email.&rdquo;</em> It only
                looks through your emails when you say &ldquo;email&rdquo; or &ldquo;forwarded&rdquo;,
                so <em>&ldquo;a market update for Springfield&rdquo;</em> still means a fresh one.
              </span>
              <span className="block mt-1.5">
                The mic beside the topic box further down is the slower version, a real conversation:
                click it (or, on desktop, hold{" "}
                <span className="spark-cta-gradient rounded px-1.5 py-0.5 text-xs font-semibold text-white">Spacebar</span>{" "}
                anywhere on the page) and just talk — your city, the topic, who it&apos;s for, the
                tone, how long. It fills in whatever it catches and asks a quick follow-up for anything
                missing, then say <strong>&ldquo;Spark it&rdquo;</strong> — or just say you&apos;re
                ready — and it writes the script.
              </span>
              <span className="block mt-1.5">
                Prefer typing, or want a suggestion instead of a blank field? Every topic
                is a chip under the box — twenty-five of them in three groups (Real estate tips,
                Formats, Local events &amp; community), your city filled in automatically. Tap one and
                it lands in the same box the mic writes into, so you can add to it before you send.
                Either way, AI researches live market data for your city and writes a
                broadcast-quality script with real stats.
              </span>
            </Step>
            <Step n={9} title="Review & Edit The Script" icon={Wand2}>
              Pick your favorite <strong>hook</strong> — it becomes the video title too, so the two never
              disagree. Edit the script freely; a live word counter keeps you inside the cap. Set your{" "}
              <strong>Call To Action</strong>, or choose <strong>None</strong> if this one shouldn&apos;t ask
              for anything. <strong>Regenerate</strong> redoes it from the same topic — it asks first, since
              it discards your edits.
            </Step>
            <Step n={10} title="Choose Format, Style & Avatar — Then Generate" icon={Video}>
              Pick a <strong>format</strong>: <strong>Vertical 9:16</strong> for Reels, Shorts and TikTok, or{" "}
              <strong>Horizontal 16:9</strong> for YouTube and websites — both up to 3 minutes with automatic
              b-roll — or <strong>Longform 16:9</strong> (up to 8 minutes, using your own photos for visuals;
              long videos have their own monthly allowance — 2 with Producer, 4 with Influencer — or $49 on its own).
              Then <strong>who&apos;s on screen</strong>: Voice only, Avatar + voice, or <strong>I&apos;ll record
              it</strong>, which is the free way out of this screen — it hands your script and photos to the
              camera instead of rendering. Attach photos or documents as b-roll, and hit{" "}
              <strong>Spark Video</strong>. Rendering time follows the length of the <em>script</em>, not the
              format — typically <strong>5–20 minutes</strong> for a short video, and up to an hour for a long
              one. You can close the page and watch for it in My Sparks. If a render ever fails, your
              allowance is refunded automatically.
            </Step>
            <Step n={11} title="Record Yourself — The Free Option" icon={Camera}>
              The camera screen is two halves. <strong>What we&apos;re writing</strong> comes first — your
              market, how long the script should be, and where the words come from: a topic, a PDF or link, a
              recording of you talking, your own typing, or <strong>Speak naturally</strong>, which is no
              script and no teleprompter at all. Then <strong>how it records</strong> — vertical or horizontal,
              Branded Look, your photos playing behind you, and <strong>Add Channel CTA</strong> to append your
              closing pitch. You can also skip straight here with <strong>Record on Camera</strong>, a
              one-click button on any script or blog post. The <strong>teleprompter scrolls automatically</strong>{" "}
              while you record in up to 1080p/60fps, for up to <strong>15 minutes</strong> (8–15 min is
              YouTube&apos;s algorithm sweet spot and unlocks mid-roll ads).
              {/* The recovery behaviour, which was invisible until it fires and
                  then reads like an error. Worded to match what the notice
                  itself says, and deliberately not promising the recording
                  survives closing the page. */}
              <span className="block mt-1.5">
                <strong>If the upload doesn&apos;t go through</strong>, the take is kept on this device
                rather than lost. You&apos;ll see <em>&ldquo;Your recording is safely waiting on this
                device&rdquo;</em> with <strong>Retry Upload</strong> and <strong>Download</strong>.
                Retrying is always safe: it checks whether the recording already reached us rather than
                saving a second copy, so a lost reply can never turn into two videos. Download first if
                you want your own copy before leaving the page.
              </span>
            </Step>
            {/* Its own step since the card moved up to row 1 and the reel
                gained a paid kind. "Free" on its own stopped being true of
                the photo reel the day Cinematic shipped. */}
            <Step n={12} title="Listings And Photos Only Reels" icon={ImageIcon}>
              <strong>Listings &amp; photos</strong>, the fourth card, makes two things from a
              set of property pictures. <strong>Listing video</strong> writes a tour from the listing —
              paste a listing link, upload photos or enter the details — and renders it in your voice,
              with your avatar on screen or the photos full-frame. It uses one short video.
              <span className="block mt-1.5">
                <strong>Photos only reel</strong> needs no script at all. Add up to 12 photos, pick the
                shape (<strong>Reel 9:16</strong> or <strong>Wide 16:9</strong>), a length, music, and
                whether it has a voiceover and a closing card with your ask and phone number. Then
                choose the <strong>Motion</strong>:
              </span>
              <span className="block mt-1.5">
                <strong>Classic</strong> is a slow pan across each photo. It is free and takes nothing
                from your plan.
              </span>
              <span className="block mt-1.5">
                <strong>Cinematic</strong> turns each photo into a few seconds of gentle camera
                movement, and uses <strong>one short video</strong>. It takes up to 8 photos and 60
                seconds, and works best on rooms and exteriors — avoid photos with people in them,
                because they can come out looking different. Every clip is checked against its
                photo; one that drifts away from it is dropped and that photo gets the classic pan
                instead. If fewer than half your photos can be animated, no video is taken from your
                plan. <strong>&ldquo;Photos animated with AI.&rdquo;</strong> is added to the
                description, so the reel says what it is.
              </span>
              <span className="block mt-1.5">
                When the reel is done the button becomes <strong>View your reel</strong>.{" "}
                <strong>Make another reel</strong>, underneath, brings the build button back — on
                Cinematic that is another short video.
              </span>
            </Step>
            <Step n={13} title="Your Share Kit — And A Blog Post" icon={FileText}>
              Every video finishes on its <strong>Share Kit</strong>: the title, description and hashtags
              Publish fills in for you, plus an Instagram caption, a LinkedIn post and an email blurb. It also
              holds a <strong>blog article</strong> — usually 800 to 1,200 words, titled with the question a
              reader would actually type, headings written the same way and answered in the first line,
              and two <strong>FAQ sections</strong> at the end. That is the shape an AI assistant quotes —{" "}
              <strong>AEO</strong> and <strong>GEO</strong>, alongside ordinary SEO.{" "}
              <strong>Header image</strong> makes the picture that sits above the headline — a real
              photograph of the kind of place the article is about, with no words drawn into it —
              and <strong>Copy as HTML</strong> then carries it across with the text, so what you
              paste into your site arrives with its image already in place. That gives one recording two places to
              be quoted from: the video&apos;s own description, which is written with a real FAQ block for
              voice search, and the article on your own site. Blog posts never use a video from your plan, and
              you can write one without making a video at all — pick <strong>Blog</strong> on the
              first question.
              <span className="block mt-1.5">
                Coming from a camera recording or a pasted script, the article starts writing itself as
                soon as the Share Kit opens — there is nothing to press. A take recorded with no script
                still has a <strong>Write the article</strong> button, because the words have to be
                taken off the video first. Before your free video it also waits for the button, so it
                never uses one of your free tries without being asked.
              </span>
              {/* Says who sends it, because the button is called Email and the
                  natural guess is that we do. */}
              <span className="block mt-1.5">
                <strong>Email</strong>, in the article&apos;s row of buttons, turns the article into an
                email for your list: a short version with a button through to the full post. Paste in
                the address of the post on your site and the button points there.{" "}
                <strong>Send me a test</strong> sends it to the address you sign in with, so you can
                see it in a real inbox (look in spam the first time), and <strong>Copy as HTML</strong>{" "}
                drops it into the email tool you already use. SparkReels does not send it to your
                clients for you.
              </span>
            </Step>
          </div>
          <VideoPlaceholder label="Creating A Video" />
        </Card>

        {/* ── PART 3 ── */}
        <Card padding="sm">
          <p className="text-xs font-bold text-primary-600 uppercase tracking-wide mb-1">Part 3 · Publish</p>
          <h2 className="text-base font-bold text-brand-text mb-4">Get It In Front Of People</h2>
          <div className="flex flex-col gap-4">
            <Step n={14} title="Publish To YouTube — One Click" icon={MonitorPlay}>
              Open the finished video in <Link href="/videos" className="text-primary-600 font-medium hover:underline">My Sparks</Link> and
              hit <strong>Publish</strong>. Your AI-generated title, description, and hashtags are attached
              automatically — choose public, unlisted, or private, and you&apos;re live without leaving the app.
              Avatar videos and Cinematic reels are marked to YouTube as AI-made when they go up,
              which YouTube asks for. Videos you record yourself and Classic reels are not.
              {/* Failures used to be a toast and nothing else: gone on refresh,
                  with no reason and nothing to retry from. Saying so is the
                  most useful line on this card when something goes wrong. */}
              <span className="block mt-1.5">
                <strong>If a publish fails</strong> — an expired YouTube connection, a channel limit, a
                video still finishing — it isn&apos;t lost in a disappearing message. The attempt is kept
                with the reason it failed and a <strong>Retry</strong> beside it, so you can see what
                happened and try again once it&apos;s sorted. The note clears itself once a later attempt
                goes through.
              </span>
            </Step>
            <Step n={15} title="Everywhere Else" icon={Upload}>
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
            <Step n={16} title="The Everyday Tools" icon={Wand2}>
              You don&apos;t need <Link href="/tools" className="text-primary-600 font-medium hover:underline">Spark Tools</Link> to
              make a video — Spark Studio generates everything automatically. Use these to iterate: brainstorm
              8 title angles before committing, draft and compare scripts without creating projects, regenerate a
              description or 20 fresh tags for any video (including older ones), and name your channel (one-time).
              <strong>LinkedIn Profile</strong> is one-time too: it writes your headline, About, current position,
              top skills, custom URL and a post announcing your channel, each with where to paste it, and can
              write a Company Page for your team.
              From any project&apos;s <strong>Title, Description &amp; Hashtags</strong> card, tap{" "}
              <strong>&ldquo;Improve With AI Tools&rdquo;</strong> and it opens the right tool with that project
              already loaded.
            </Step>
            {/* The graphics tools, which were not described anywhere — and the
                counting rule, which is the thing people actually need to know
                before they press a button that spends something. */}
            <Step n={17} title="Graphics Without A Designer" icon={ImageIcon}>
              The <strong>Image Generator</strong> makes a finished graphic: pick{" "}
              <strong>Just listed</strong>, <strong>Open house</strong>, <strong>Market update</strong>,{" "}
              <strong>Blog header</strong> or <strong>Blank</strong>, describe the picture you want, and
              type your own headline. The photograph is generated; <em>your words are drawn as real
              type on top</em>, never by the AI — so a price or an address is always spelled right.
              Choose 4:5 for Instagram and Facebook, 9:16 for Stories and Reels, or 16:9 for a blog or
              YouTube, and it carries your logo and headshot.
              <span className="block mt-1.5">
                Each press makes <strong>one</strong> AI photo and counts one against your monthly
                allowance of 100. <strong>Update text</strong> redraws your words on the same picture
                and costs nothing, and using <strong>My photo</strong> or one of your listing photos is
                free. <strong>New background</strong> makes another photo, and counts as one.{" "}
                <strong>Use as blog header</strong> sends it straight to the article it belongs to.
              </span>
              <span className="block mt-1.5">
                <strong>Banners</strong> makes the wide image across the top of your YouTube channel,
                your LinkedIn profile or your Facebook page, each at the size that site wants. Put your
                photo on the left or the right, pick a color palette or choose <strong>Custom</strong>{" "}
                and set your own colors, and add QR codes to your site. Download the picture, or use{" "}
                <strong>Download for Canva (PDF)</strong> for a copy meant to be opened in Canva, where
                you can change the text and colors yourself.
              </span>
            </Step>
            <Step n={18} title="AI Answer Blocks — Get Cited By AI Search" icon={Bot}>
              Buyers ask ChatGPT and Perplexity things like &ldquo;which neighborhood should I buy in?&rdquo;
              months before they call an agent. This tool researches what they&apos;re actually asking in{" "}
              <em>your</em> market and gives you two ways to answer each question: a <strong>video topic</strong> you
              can record right now — including a <strong>Record on Camera</strong> shortcut straight to the
              teleprompter — and a short ready-to-paste <strong>answer</strong> for your website, written the
              way AI assistants extract and cite answers. Think of it as the step before everything else:
              Answer Blocks decides <em>what</em> is worth saying, and the Share Kit&apos;s blog article (step
              13) is the long version of whatever you then make.
            </Step>
          </div>
          <VideoPlaceholder label="AI Tools" />
        </Card>

        {/* ── PART 5 ── */}
        {/* Added because none of this was written down anywhere: "Spark" named
            two different things in the menu, and the two screens that report
            on your work had no explanation at all. */}
        <Card padding="sm">
          <p className="text-xs font-bold text-primary-600 uppercase tracking-wide mb-1">Part 5 · Finding Your Work</p>
          <h2 className="text-base font-bold text-brand-text mb-4">Sparks, The Dashboard And Insights</h2>
          <div className="flex flex-col gap-4">
            <Step n={19} title="What A Spark Is" icon={Sparkles}>
              A <strong>Spark</strong> is one idea and everything that came out of it: the script, the
              video or videos made from it, the article, the captions, and where each has been
              published. One topic, one Spark — even if you make a short version, a long version and a
              reel from it.
              <span className="block mt-1.5">
                Two places in the menu use the word, and they hold different things.{" "}
                <Link href="/videos" className="text-primary-600 font-medium hover:underline">My Sparks</Link>{" "}
                is your <strong>library</strong>: the finished videos and drafts themselves, to watch,
                download, publish or delete. The <strong>All Sparks</strong> panel inside Spark
                Calendar lists the <strong>Sparks</strong> — open one and you get its card, holding the
                article, the captions, the schedule and how it&apos;s performing.
              </span>
            </Step>
            <Step n={20} title="The Dashboard — What To Do Next" icon={LayoutDashboard}>
              <Link href="/dashboard" className="text-primary-600 font-medium hover:underline">Dashboard</Link>{" "}
              is the starting point, not a report. It shows what you have left — short videos, long
              videos, and whether camera recording is unlocked with the days remaining — a{" "}
              <strong>Getting Started</strong> checklist that disappears once you&apos;ve finished it,
              and your five most recent projects to pick back up.
            </Step>
            <Step n={21} title="Spark Insights — What Happened After" icon={BarChart2}>
              <Link href="/analytics" className="text-primary-600 font-medium hover:underline">Spark Insights</Link>{" "}
              is the opposite: it looks backwards. How many videos you&apos;ve made and published, a
              breakdown by platform and by video shape, and — for anything published to your connected
              YouTube channel — real <strong>views, likes and comments</strong>, with every video
              ranked and linked. Those numbers are fetched from YouTube once a day, so they&apos;re
              yesterday&apos;s picture rather than live, and they only cover videos published from
              September onwards. The same figures appear on each Spark&apos;s own card, counting just
              that Spark&apos;s videos.
              <span className="block mt-1.5">
                Watch time and click-through aren&apos;t there yet — YouTube keeps those behind a
                separate permission. Views, likes and comments are what a connected channel gives us
                today.
              </span>
            </Step>
            <Step n={22} title="Spark Calendar — When It Goes Out" icon={CalendarDays}>
              The calendar puts every dated item — published or scheduled — on a month, week or list
              view, with the <strong>All Sparks</strong> panel beside it for everything that has no
              date yet. Open any Spark from either side to reach its card. This one is still rolling
              out: it appears in your sidebar when your account has it.
            </Step>
          </div>
          <VideoPlaceholder label="Finding Your Work" />
        </Card>

        {/* ── Quick reference ── */}
        <Card padding="sm" className="bg-gradient-to-br from-slate-50 to-white">
          <h2 className="text-base font-bold text-brand-text mb-3">The Weekly Rhythm</h2>
          <ol className="text-sm text-slate-600 leading-relaxed space-y-1.5 list-decimal pl-5">
            <li><strong>Once:</strong> set up your profile, voice, avatar, CTA, YouTube and your email import address (Part 1)</li>
            <li><strong>Weekly:</strong> hit the mic and say it, tap a topic chip, or forward a report → generate script → Spark Video — about 5 minutes of your time</li>
            <li><strong>Publish:</strong> one click to YouTube with title, description, and tags attached</li>
            <li><strong>For a listing:</strong> a Classic photos only reel is free; Cinematic or a listing video uses one short video</li>
            <li><strong>Mix in</strong> free camera videos — YouTube&apos;s algorithm loves 8–15 minute authentic long-form</li>
            <li><strong>Every one</strong> also gives you a blog article for your own site, which costs nothing from your plan</li>
          </ol>
          {/* Still no link: the Spark Calendar is behind feature_access, so
              sending most people to it would be pointing them at a 404. Part 5
              now explains what it is, so this only has to say where it appears. */}
          <p className="text-xs text-slate-400 mt-3">
            Part 5 covers <strong>Sparks</strong>, the <strong>Dashboard</strong> and{" "}
            <strong>Spark Insights</strong> — where your work lives and how it&apos;s doing. The{" "}
            <strong>Spark Calendar</strong> described there is still rolling out, and appears in your
            sidebar when your account has it.
          </p>
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
