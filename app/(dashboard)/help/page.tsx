import { Card } from "@/components/ui/card";
import Link from "next/link";
import {
  Mic, Sparkles, Video, MonitorPlay, Wand2, PlayCircle, FileText,
  MapPin, User, Megaphone, Camera, Upload, Rocket, Bot,
  BarChart2, CalendarDays, Mail, Image as ImageIcon, DollarSign,
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
    // Full width, at the owner's request (2026-10-13): held to a narrow
    // column, the guide "looked so long on the page".
    <div className="w-full">
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

        {/* Getting around: the top menu and the Settings tabs, both new on
            2026-10-14. Not a numbered step, so the steps keep their numbers. */}
        <Card padding="sm">
          <p className="text-xs font-bold text-primary-600 uppercase tracking-wide mb-1">Before You Start</p>
          <h2 className="text-base font-bold text-brand-text mb-3">Getting Around</h2>
          <ul className="flex flex-col gap-2 text-sm text-slate-600 leading-relaxed list-disc pl-5">
            <li>
              <strong>The menu runs across the top</strong> on a computer: Spark Studio, My Sparks, Spark
              Tools, Spark Calendar, Spark Insights, Affiliate, Settings and How It Works. The page you are
              on is underlined. On a smaller window the last few are under <strong>More</strong>; on a
              phone, tap <strong>☰</strong>.
            </li>
            <li>
              <strong>Settings has three tabs.</strong> <strong>Profile</strong> holds your brand, market,
              voice, closing call to action, import address and password. <strong>Social Accounts</strong>{" "}
              is where YouTube and your other platforms are connected. <strong>Billing</strong> is your
              plan and buying more videos.
            </li>
            <li>
              <strong>Your initial</strong>, at the top right, opens your email, your plan and{" "}
              <strong>Sign Out</strong>.
            </li>
            <li>
              <strong>Sparklee</strong>, the gold star beside it, answers out loud when you ask how to do
              something on the page you are on. Tap her to start, and tap <strong>Stop</strong> when
              you&apos;re done.
            </li>
            {/* Saving it to a phone's Home Screen, at the owner's ask (2026-10-16). */}
            <li>
              <strong>Put SparkReels on your phone&apos;s Home Screen</strong> so it opens like an app.
              On an <strong>iPhone</strong>, open sparkreels.ai in <strong>Safari</strong>, tap the{" "}
              <strong>Share</strong> button (the square with an arrow), then{" "}
              <strong>Add to Home Screen</strong>. On <strong>Android</strong>, open it in{" "}
              <strong>Chrome</strong>, tap the <strong>⋮</strong> menu, then{" "}
              <strong>Add to Home screen</strong> (or <strong>Install app</strong>).
            </li>
            <li>
              <strong>The first time you sign in</strong>, Sparklee asks you to set up your profile.{" "}
              <strong>Ask me how</strong> has her talk you through it; <strong>Go to Settings</strong> takes
              you straight there.
            </li>
          </ul>
        </Card>

        {/* ── PART 1 ── */}
        <Card padding="sm">
          <p className="text-xs font-bold text-primary-600 uppercase tracking-wide mb-1">Part 1 · One-Time Setup</p>
          <h2 className="text-base font-bold text-brand-text mb-4">Set Up Once (~10 Minutes)</h2>
          <div className="flex flex-col gap-4">
            <Step n={1} title="Complete Your Brand Profile" icon={User}>
              In <Link href="/settings" className="text-primary-600 font-medium hover:underline">Settings → Profile → Brand &amp; AI Profile</Link>, add
              your name, brokerage, phones, website, and license number. Upload your <strong>logo</strong> and
              your <strong>headshot</strong> — the headshot becomes your AI Photo Avatar, and your contact card
              and logo appear automatically in every video.
            </Step>
            <Step n={2} title="Set Your Market" icon={MapPin}>
              In <strong>Settings → Profile → Content Preferences</strong>, enter your city, state, and video language.
              This powers live local market research, trending topics, and auto-localized templates.
            </Step>
            <Step n={3} title="Create Your AI Voice" icon={Mic}>
              In <strong>Settings → Profile → AI Voice Clone</strong>, record or upload about 30 seconds of your voice.
              Your AI videos will speak in <em>your</em> voice.
              {/* The two tabs looked like buttons that did nothing; said here
                  as what they are, with the one that starts it. */}
              <span className="block mt-1.5">
                The card has two tabs. <strong>Record my voice</strong> gives you a short script to
                read aloud, which you can edit or replace with your own words. Press{" "}
                <strong>Start recording</strong>, speak clearly and naturally for at least 30
                seconds, press <strong>Stop Recording</strong>, then{" "}
                <strong>Use this recording</strong>, or <strong>Re-record</strong> to try again.{" "}
                <strong>Upload a file</strong> is for a recording you already have.
              </span>
              <span className="block mt-1.5">
                If your voice clone ever stops being available, a video tells you before it is
                made and nothing is taken from your plan. Record your voice again here and try
                again.
              </span>
            </Step>
            {/* Back since 2026-10-20: HeyGen confirmed API twins need no
                Enterprise plan. The owner's wording. */}
            <Step n={4} title="Make Your Digital Twin (Optional)" icon={Video}>
              Your Digital Twin is a lifelike video of you that talks and moves like you. In{" "}
              <strong>Settings → Profile → Digital Twin</strong>, record about 2 minutes of yourself
              talking to the camera: phone at eye level, good light, quiet room, only you in the shot.
              Upload it or pick a recording from the Camera tab, then tap{" "}
              <strong>Train Digital Twin</strong>. It&apos;s ready in 15 to 30 minutes; approve it once,
              and it shows up as an avatar look in every video. On the free plan your twin appears
              in <strong>Avatar (You) in circle</strong>; on paid plans it works in{" "}
              <strong>Avatar (You in full) video</strong> too. You can delete it any time in Settings.
            </Step>
            <Step n={5} title="Set Your Default Video CTA" icon={Megaphone}>
              In <strong>Settings → Profile → Default Video CTA</strong>, add your years in real estate and review the
              pre-written closing call-to-action. It auto-fills your name, team, and <em>each video&apos;s</em> city —
              edit it once and every video ends with a proven subscribe-and-contact close. Change it
              later and it carries into videos you have already started, unless you typed over the
              closing line in that video; <strong>Use my saved CTA</strong> there brings it back.
            </Step>
            <Step n={6} title="Connect YouTube And Your Other Accounts" icon={MonitorPlay}>
              In <Link href="/settings/social" className="text-primary-600 font-medium hover:underline">Settings → Social Accounts</Link>,
              connect the Google account that owns your channel. One-time tip: verify the channel by phone at
              youtube.com/verify so your thumbnails are added automatically.
              {/* The two things that kept the owner's own channel unverified
                  for an afternoon (2026-10-13). */}
              <span className="block mt-1.5">
                <strong>Still not working?</strong> YouTube&apos;s verify page opens for whichever
                channel your browser is on, so check the picture at its top right is this channel.
                If it isn&apos;t, open the page in a private window signed in to this channel only.
                And one phone number verifies two channels a year: if YouTube says yours is used
                up, use another phone or a landline.
              </span>
              {/* A beta tester's thumbnail was refused on an unverified channel
                  (2026-10-16); this is how to put it on afterwards. */}
              <span className="block mt-1.5">
                <strong>Thumbnail didn&apos;t go up?</strong> Your video still posted. YouTube only
                takes a custom thumbnail from a phone-verified channel. Verify the channel at
                youtube.com/verify, then open the video&apos;s Publish window in My Sparks and press{" "}
                <strong>Update it on YouTube</strong> under the thumbnail. Or download the thumbnail
                there and add it in YouTube Studio.
              </span>
              {/* Added when posting to the other platforms went live. What each
                  account has to be is said here because it is the usual reason
                  a connection does not appear. */}
              <span className="block mt-1.5">
                On a paid plan the same screen has <strong>More platforms</strong>: Instagram, Facebook,
                LinkedIn, TikTok, X, Threads and Google Business. Press <strong>Connect</strong> beside
                each one you use and approve it on that platform&apos;s own screen, which names
                Upload-Post, the service that delivers your posts. Connect as many as you like, and{" "}
                <strong>Disconnect</strong> any of them there too. A few need the right kind of account: Instagram must
                be a Business or Creator account linked to a Facebook Page, Facebook must be a Page
                rather than your personal profile, and Google Business must be a verified profile.
              </span>
              {/* Added with the picker. One Page is used automatically, so this
                  only matters to an agent with two, and it matters a lot then:
                  with nothing chosen the post is refused. */}
              <span className="block mt-1.5">
                If an account can post to more than one place, a <strong>Posts to</strong> choice
                appears under it: which Facebook Page, your LinkedIn profile or a company page, which
                Google Business location. Pick once and every post goes there. With two Facebook
                Pages or two locations you do have to pick, or posts there won&apos;t go out.
              </span>
              {/* BoldTrail, added 2026-10-15. */}
              <span className="block mt-1.5">
                <strong>BoldTrail.</strong> If you use BoldTrail, SparkReels can email your sellers and
                clients through it, from your own BoldTrail address, and BoldTrail keeps each email on
                that contact&apos;s record. In BoldTrail, go to Lead Engine → Lead Dropbox → My API
                Tokens, tick <strong>Contacts</strong>, press <strong>Generate</strong> and copy the
                token. Then paste it into the <strong>BoldTrail</strong> box in Settings → CRM
                Integration and press <strong>Connect</strong>. It&apos;s saved securely and shown only
                by its last four characters; <strong>Disconnect</strong> removes it. If BoldTrail
                won&apos;t send with a Contacts token, make one with <strong>All</strong> ticked.
                Tokens last a year.
              </span>
            </Step>
            {/* Setup rather than creating, because the useful half is done once:
                saving the address. After that it is a Forward button in whatever
                mail app you already live in. */}
            <Step n={7} title="Save Your Import Address" icon={Mail}>
              In <Link href="/settings" className="text-primary-600 font-medium hover:underline">Settings → Profile → Import Articles By Email</Link>{" "}
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
                Once something has arrived,{" "}
                <Link href="/create" className="text-primary-600 font-medium hover:underline">Spark Studio</Link>{" "}
                has it under <strong>My Content/Forwarded in</strong>, in the{" "}
                <strong>Script source</strong> row, with a <strong>new</strong> badge when something
                has come in since you last looked. Open it, choose <strong>From email</strong>, and
                pick the one you want. Nothing is written until you press the button at
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
                  <td className="py-2 pr-3 font-semibold text-brand-text whitespace-nowrap">Camera/Teleprompter</td>
                  <td className="py-2 pr-3">Film yourself with the teleprompter</td>
                  <td className="py-2 whitespace-nowrap font-semibold text-green-600">FREE, unlimited*</td>
                </tr>
                <tr className="border-t border-slate-100">
                  <td className="py-2 pr-3 font-semibold text-brand-text whitespace-nowrap">Blog</td>
                  <td className="py-2 pr-3">Words for your own site — no video made at all</td>
                  <td className="py-2 whitespace-nowrap font-semibold text-green-600">FREE, unlimited*</td>
                </tr>
                {/* The three kinds of Video / Reel, by the names the "Choose your
                    video" page and Video setup both use. */}
                <tr className="border-t border-slate-100">
                  <td className="py-2 pr-3 font-semibold text-brand-text whitespace-nowrap">Avatar video</td>
                  <td className="py-2 pr-3">You on screen, with b-roll and graphics made for you. Up to 3 minutes</td>
                  <td className="py-2 whitespace-nowrap">1 short video</td>
                </tr>
                <tr className="border-t border-slate-100">
                  <td className="py-2 pr-3 font-semibold text-brand-text whitespace-nowrap">Avatar in circle</td>
                  <td className="py-2 pr-3">You in a corner circle, over AI scenes that follow each sentence, with your photos among them</td>
                  <td className="py-2 whitespace-nowrap">1 short video</td>
                </tr>
                <tr className="border-t border-slate-100">
                  <td className="py-2 pr-3 font-semibold text-brand-text whitespace-nowrap">Voice over only</td>
                  <td className="py-2 pr-3">A Scenes Reel: no face, no photos, no camera. Your voice over AI scenes, up to 3 minutes</td>
                  <td className="py-2 whitespace-nowrap">1 short video</td>
                </tr>
                {/* One row where there were three (Paste my script, Shorten my
                    article, Something you already have), because the app now
                    has one card for all of it. */}
                <tr className="border-t border-slate-100">
                  <td className="py-2 pr-3 font-semibold text-brand-text whitespace-nowrap">My Content/Forwarded in</td>
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
              {" "}Before that video, you get <strong>1 free blog</strong>,{" "}
              <strong>1 free camera recording</strong>, <strong>2 free tries</strong> of the AI Tools and{" "}
              <strong>2 free AI images</strong> to see how they work — one try per tool run.
              Making the video is free and lifts all of those limits.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            {/* The page's order changed: the topic is first now, under the
                headline, and the cards and the source row follow it. Its own
                sections are called by their labels here, not "step 1", so
                they are not mistaken for the numbered steps of this guide. */}
            <Step n={8} title="Start With The Topic, Then Choose What To Make" icon={Sparkles}>
              <Link href="/create" className="text-primary-600 font-medium hover:underline">Spark Studio</Link>{" "}
              has four sections, top to bottom. <strong>1 · Say or Pick a Topic</strong> — one card with
              the mic and a box, where you say or type what it&apos;s about (step 9).{" "}
              <strong>2 · Create</strong> — four
              cards: <strong>Video / Reel</strong>, <strong>Camera/Teleprompter</strong>,{" "}
              <strong>Blog</strong> or <strong>Listings &amp; photos</strong>. Video / Reel stays on
              this page; the other three each open a page of their own, with{" "}
              <strong>Back</strong> on the bar at the bottom to return here. A topic you
              already said or typed comes with you.{" "}
              <strong>3 · Script Source</strong> — <strong>AI writes it</strong> from
              a topic, or <strong>My Content/Forwarded in</strong>, which is also where anything
              you forwarded in turns up (step 7). A listing or a photos only reel skips this
              one (step 14). <strong>4 · Details</strong> — the city and state, who
              it&apos;s for, and a video&apos;s format.
              <span className="block mt-1.5">
                You don&apos;t have to work down all four. Give it a topic at the top, check the
                city and state, and press <strong>Next</strong> at the bottom. The sections
                underneath are there for when you want to change something first.
              </span>
              {/* The three kinds of video, chosen under the Video / Reel card.
                  It was a page of its own until 2026-10-13. */}
              <span className="block mt-1.5">
                <strong>Video / Reel</strong> is three kinds of video, and they sit right under
                that card for you to pick, so the script is written to suit. Pick one any time; if
                you press Next first, they light up and ask.
                <strong> Avatar video</strong> puts you on screen with b-roll
                and graphics made for you. <strong>Avatar in circle</strong> puts you in a corner
                circle over scenes that follow what you&apos;re saying. <strong>Voice over only</strong>{" "}
                has nobody on screen: it is a Scenes Reel (step 12). Each uses one short video. If
                your sentence already said which, such as &ldquo;with my avatar&rdquo; or
                &ldquo;voice over only&rdquo;, it isn&apos;t asked.
              </span>
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
                <strong>My Content/Forwarded in</strong> is the one place for it, the second
                box under Script source. Paste your words in, or attach a PDF, a link, or an email you
                forwarded to your import address (step 7). On a video you then say what happens to
                them: <strong>Speak it word for word</strong>, for a finished script, or{" "}
                <strong>Have AI write from it</strong>, which either writes a new script from it or
                shortens an article of your own. The script comes back for you to read before
                anything is made. If an email&apos;s subject names a town, the city and state fill in
                for you. Recording yourself has its own version of this, <strong>From a document</strong>.
              </span>
              <span className="block mt-1.5">
                On the <strong>Blog</strong> page the same tile is there, and you choose
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
                <strong>Why</strong> are three optional pickers under Details. What
                you choose shapes the script, the article and the Spark Tools afterwards. You can
                also just say them:{" "}
                <em>&ldquo;for first-time buyers&rdquo;</em>, <em>&ldquo;make it vertical&rdquo;</em>. If your
                audience is not on the list — first responders, nurses relocating — choose{" "}
                <strong>Add your own&hellip;</strong> at the bottom of Audience and type it. It is saved
                to your account, so it is there on your phone and your computer, and choosing it again
                shows <strong>Remove from my list</strong> for when you no longer want it.
              </span>
            </Step>
            <Step n={9} title="Speak It Or Type It — Your Choice" icon={Mic}>
              {/* Ask Sparklee, added 2026-10-14; her badge and the card on the
                  steps bar, 2026-10-15. */}
              <span className="block mb-1.5">
                Need help on a section? Tap <strong>Sparklee</strong>, the gold star at the top of the
                screen, or <strong>Ask Sparklee</strong> at the end of the steps on Spark Studio, and ask
                out loud how to do something. She answers in a few seconds, out loud and on screen, from
                this guide. Each conversation runs up to five minutes. Five conversations a day before you
                pick a plan, twenty a day on one.
              </span>
              {/* One card now: the mic and the box together, at the top, where
                  signing in lands. Example towns are generic on purpose. */}
              The Topic card at the top of Spark Studio reads{" "}
              <strong>Say it in your own words</strong>. It has one mic and one box, and
              they are the same thing: what you say shows up in the box, and what you type goes in the
              same place. Tap
              the mic and say the whole thing in one sentence —{" "}
              <em>&ldquo;Create a blog for downsizers about one-floor living in Springfield&rdquo;</em> or{" "}
              <em>&ldquo;Make a vertical video with my avatar about the Riverside
              market&rdquo;</em> — and tap the mic again when you&apos;re done. Your words stay in the box,
              so a misheard town or street name is a quick fix.
              {/* What happens to the words. There is no Send and no
                  conversation any more: the page fills itself in. */}
              <span className="block mt-1.5">
                A moment after you stop, the page fills itself in from what you said: the card
                under <strong>2 · Create</strong> lights up, the city and state appear under{" "}
                <strong>4 · Details</strong>, and the audience and format are set if you named
                them. Look down the page to check it, change anything by hand, and press{" "}
                <strong>Next</strong> at the bottom. Say more and it is added to the box and read
                again. Say <em>&ldquo;Spark it&rdquo;</em> and it presses Next for you.
              </span>
              <span className="block mt-1.5">
                A blog is written straight away. A video stops at its script, so nothing comes out
                of your plan until you choose to make it. The script&apos;s length follows the
                format: up to <strong>90 seconds</strong> for Vertical, up to{" "}
                <strong>3 minutes</strong> for Horizontal, and up to <strong>8 minutes</strong> for
                Longform.
              </span>
              <span className="block mt-1.5">
                Say <em>&ldquo;make a reel about&hellip;&rdquo;</em> and it makes a Voice over only
                Scenes Reel (step 12). Say who&apos;s in it, as in <em>&ldquo;a reel with my
                avatar&rdquo;</em>, and it makes that instead.
              </span>
              {/* The cards and the box agree, in both directions. */}
              <span className="block mt-1.5">
                The cards follow along. Say &ldquo;create a blog&rdquo; and the Blog card is the
                one picked; tap a card yourself and the box makes that instead.
              </span>
              <span className="block mt-1.5">
                You can start from an email you forwarded the same way:{" "}
                <em>&ldquo;Create a blog from my Springfield market report email.&rdquo;</em> It only
                looks through your emails when you say &ldquo;email&rdquo; or &ldquo;forwarded&rdquo;,
                so <em>&ldquo;a market update for Springfield&rdquo;</em> still means a fresh one.
              </span>
              <span className="block mt-1.5">
                You don&apos;t have to say it all at once. Give it the topic, then the town, then who
                it&apos;s for, one answer at a time, and it keeps what it has already heard. On a
                desktop you can hold{" "}
                <span className="spark-cta-gradient rounded px-1.5 py-0.5 text-xs font-semibold text-white">Spacebar</span>{" "}
                anywhere on the page instead of tapping the mic. Once it says it has everything,
                saying <strong>&ldquo;Spark it&rdquo;</strong> starts it too.
              </span>
              <span className="block mt-1.5">
                Prefer typing, or want a suggestion instead of a blank box? The box shows a{" "}
                <strong>Try</strong> example that changes every few seconds; press the empty box to use
                the one showing, or just start typing. Under it is a{" "}
                <strong>Quick win</strong>: a ready topic for your town in one press, with a new idea
                each time you sign in (your very first one is a market update). Then{" "}
                <strong>What buyers ask AI</strong> (step 20), and under that <strong>Or try</strong>:
                ideas with your city filled in, with <strong>More ideas</strong> opening the whole list
                and a search box. Tap one and it lands in the same box the mic writes into, so you can
                add to it before you send.
                Either way, AI researches live market data for your city and writes a
                broadcast-quality script with real stats.
              </span>
            </Step>
            <Step n={10} title="Review & Edit The Script" icon={Wand2}>
              Pick your favorite <strong>hook</strong> — it becomes the video title too, so the two never
              disagree. Edit the script freely; a live word counter keeps you inside the cap. Your{" "}
              <strong>Call To Action</strong> is on the next screen, in Video setup under Music: it is spoken
              after your script, so edit it there, or tick <strong>No call to action</strong> to end
              the video on your script. <strong>Regenerate</strong> redoes it from the same topic — it asks first, since
              it discards your edits.
            </Step>
            <Step n={11} title="Choose Format And Who's On Screen — Then Generate" icon={Video}>
              Pick a <strong>format</strong>: <strong>Vertical 9:16</strong> for Reels, Shorts and TikTok, or{" "}
              <strong>Horizontal 16:9</strong> for YouTube and websites — both up to 3 minutes — or{" "}
              <strong>Longform 16:9</strong> (up to 8 minutes. Add your own photos and you&apos;re in a
              circle over them; add none and you&apos;re full screen the whole time. Long videos have their
              own monthly allowance — 2 with Producer, 4 with Influencer — or $29 on its own.)
              {/* The same four for every script now, pasted or written. */}
              <span className="block mt-1.5">
                Then <strong>who&apos;s on screen</strong>, four choices that are the same for every
                script, whether AI wrote it or you pasted your own:
              </span>
              <span className="block mt-1.5">
                <strong>Avatar video</strong> — you on screen, with b-roll and graphics made
                for you. Up to 3 minutes, so it is not offered for Longform. It takes a script of up
                to 400 words, counting your closing line. If yours is longer, Avatar video is greyed
                out and a note under the choices says how many words you have. Press{" "}
                <strong>Shorten to fit</strong> and the script is cut to fit, or{" "}
                <strong>Shorten closing line</strong> to trim your closing line yourself.
              </span>
              <span className="block mt-1.5">
                <strong>Avatar in circle</strong> — you in a corner circle, speaking the script
                exactly as written, over scenes made for each sentence. Attach a few photos and
                each takes a sentence among the scenes; attach many and the photos are the background.
              </span>
              <span className="block mt-1.5">
                <strong>Voice over only</strong> — nobody on screen. Your voice over AI scenes made
                for each sentence, or over your photos if you attached some. The quickest of the
                three.
              </span>
              <span className="block mt-1.5">
                <strong>You on camera</strong> — the free way out of this screen. It hands your
                script and photos to the camera instead of making a video.
              </span>
              <span className="block mt-1.5">
                The first three use one video from your plan. Attach photos or documents as b-roll,
                and hit <strong>Spark Video</strong>. How long it takes follows the length of the{" "}
                <em>script</em>, not the format: Voice over only is usually ready in{" "}
                <strong>2 to 10 minutes</strong>, an avatar video in <strong>5 to 20</strong>, and a
                long one can take up to an hour. You can close the page and watch for it in My
                Sparks. If a video fails, your allowance is refunded automatically. When lots of
                videos are being made at once, yours waits <strong>in line</strong> and starts on its
                own a few minutes later; nothing is charged until it starts.
              </span>
            </Step>
            {/* Its own step: the owner wants it found, and it was the last
                paragraph of the listings step. */}
            <Step n={12} title="Voice Over Only — The Scenes Reel" icon={Sparkles}>
              A <strong>Scenes Reel</strong> needs no photos, no camera and no face. Your voice
              clone reads the script over short, realistic scenes made with AI, one for each
              sentence, on screen while that sentence is spoken. It is the quickest video to make
              and a good fit for Reels and Shorts.
              <span className="block mt-1.5">
                <strong>To make one:</strong> give the Topic card a topic, choose{" "}
                <strong>Video / Reel</strong>, pick <strong>Voice over only</strong> under it, and
                press <strong>Next</strong>. Or just say{" "}
                <em>&ldquo;make a reel about winter selling tips in Springfield&rdquo;</em>.
              </span>
              <span className="block mt-1.5">
                The script is written for you and waits to be read. Edit it, or tap{" "}
                <strong>Rewrite</strong>. Choose a length — <strong>30 sec</strong>,{" "}
                <strong>60 sec</strong>, <strong>90 sec</strong>, <strong>2 min</strong> or{" "}
                <strong>3 min</strong> — <strong>Vertical</strong> or <strong>Horizontal</strong>,
                captions, music and your closing card, then press{" "}
                <strong>Build the Scenes reel</strong>.
              </span>
              <span className="block mt-1.5">
                It builds on its own after that, so you can leave the page. It shows as rendering
                in <Link href="/videos" className="text-primary-600 font-medium hover:underline">My Sparks</Link>{" "}
                and then as finished: a few minutes for a short one, around ten for three minutes.
                If it can&apos;t be built, My Sparks says so and nothing is taken from your plan.
              </span>
              {/* What the scenes are and are not, said plainly: it sits beside
                  routes that show a real home. */}
              <span className="block mt-1.5">
                The scenes show what each sentence is about and change from one to the next:
                close-ups, rooms, streets, different light. They are generic on purpose. People
                appear only from behind or at a distance, there are no readable words, and it is
                never your town or a real listing. For a real property use a Photos only reel with
                its own photos (step 14). A Scenes Reel uses <strong>one short video</strong>, and{" "}
                <strong>&ldquo;Scenes made with AI.&rdquo;</strong> is added to its description.
              </span>
            </Step>
            <Step n={13} title="Camera/Teleprompter — The Free Option" icon={Camera}>
              Pressing <strong>Camera/Teleprompter</strong> opens a page of its own, with{" "}
              <strong>Back</strong> on the bar at the bottom to return to Spark Studio. On a computer it
              starts with <strong>Record yourself</strong> or <strong>Record your screen</strong>.{" "}
              <strong>What we&apos;re writing</strong> comes next — your
              market, how long the script should be, and where the words come from: a topic, a PDF or link, a
              recording of you talking, your own typing, or <strong>Speak naturally</strong>, which is no
              script and no teleprompter at all. When AI is writing it from a topic, the mic box at the top
              of this page holds the topic — anything you already said or typed on Spark Studio comes
              with you — and <strong>Write my script</strong> in the bar
              at the bottom writes it and loads it into your teleprompter.
              Then <strong>how it records</strong> — vertical or horizontal,
              Branded Look, what plays behind you, and <strong>Add Channel CTA</strong> to append your
              closing pitch. You can also skip straight here with <strong>Record on Camera</strong>, a
              one-click button on any script or blog post. The <strong>teleprompter scrolls automatically</strong>{" "}
              while you record in up to 1080p/60fps, for up to <strong>15 minutes</strong> (8–15 min is
              YouTube&apos;s algorithm sweet spot and unlocks mid-roll ads).
              On a computer, press Camera/Teleprompter and choose <strong>Record your screen</strong> to record a listing, a market
              report or anything else on screen while you talk, with you in a corner circle or not.
              It records horizontal, up to 10 minutes, and finishes like any camera recording.
              {/* Three things can be behind the speaker now, and one of them
                  costs something, on a screen whose headline is "free". */}
              <span className="block mt-1.5">
                <strong>What plays behind you</strong> is one of three things, with you in the
                corner. <strong>Your photos</strong>, if you attached any.{" "}
                <strong>Play my footage behind me</strong>, a clip of your own. Or, with neither,{" "}
                <strong>Make scenes from my script</strong>: short realistic scenes made with AI,
                one for each part of what you&apos;re about to say, in order. People appear only from
                behind or at a distance, and it is never your town or a real property. Scenes take
                about three minutes to make and use{" "}
                <strong>one short video</strong> from your plan; photos and your own footage stay
                free. Write the script first, because the scenes are made from it.
              </span>
              {/* The camera's skin filter (2026-10-16). */}
              <span className="block mt-1.5">
                <strong>Smooth skin</strong> softens fine lines and blemishes while you record. With{" "}
                <strong>Branded Look</strong> on, pick <strong>Light</strong> or <strong>More</strong> in
                its box. The preview shows it right away, and your choice is remembered on that device.
              </span>
              <span className="block mt-1.5">
                With a clip or scenes chosen you can tick <strong>Open on it</strong>. The first 5
                seconds of the take are then the clip full screen with a title you type, and you
                appear after that. Start talking as soon as you press record; your voice is heard over
                the opener.
              </span>
              {/* Brand a clip I already shot, which How It Works never named
                  (2026-10-20, the owner's wording). Computers only. */}
              <span className="block mt-1.5">
                <strong>Upload a clip you already shot</strong> — on a computer, open{" "}
                <strong>Camera/Teleprompter</strong> in Spark Studio. Under{" "}
                <strong>Where the picture comes from</strong>, choose{" "}
                <strong>Brand a clip I already shot</strong>, then{" "}
                <strong>Choose a clip you already shot</strong> and pick a video from your computer: MP4,
                MOV or WebM, up to 2 minutes and 500 MB. Keep the clip&apos;s own sound or record a new
                voiceover, add a title, a hook and the city, then press <strong>Brand this clip</strong>.
                Your logo is added, captions are written from what&apos;s said, and the finished video is
                saved to <strong>My Sparks</strong>, ready to publish. It counts as a camera recording,
                not one of your plan&apos;s videos. This is on computers only; phones can&apos;t do the
                branding yet.
              </span>
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
            <Step n={14} title="Listings And Photos Only Reels" icon={ImageIcon}>
              <strong>Listings &amp; photos</strong>, the fourth card, opens a page of its own with two
              tabs, and both start from a set of property pictures. <strong>Back</strong>, on the bar
              at the bottom, returns to Spark Studio.{" "}
              <strong>Listing video</strong> writes a tour from the listing —
              paste a Zillow or Redfin link (other sites coming soon), upload photos or enter the details — and renders it in your voice,
              with your avatar on screen or the photos full-frame. It uses one short video. Once the
              address and price are in, press <strong>Next · video setup</strong> on the bar at the
              bottom to have the tour written, or <strong>Write it — I&apos;ll read it on camera</strong>{" "}
              to go straight to the teleprompter with your photos behind you, free.
              {/* Photo counts (2026-10-16). */}
              <span className="block mt-1.5">
                A video takes up to <strong>20 photos</strong>; Avatar video uses the first 15. When
                your photos are enough to fill the video, no stock footage is added.
              </span>
              <span className="block mt-1.5">
                <strong>Photos only reel</strong> needs no script at all. Add up to 12 photos — upload
                them, or paste a Zillow or Redfin link and its photos are brought in for you — then pick the
                format (<strong>Vertical</strong> or <strong>Horizontal</strong>), a length, music, and
                whether it has a voiceover and a closing card with your ask and phone number. A
                voiceover you type is read in <strong>your own voice clone</strong> once you have set
                one up, and by a stock voice until then. Then choose the <strong>Motion</strong>:
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
                <strong>Build the reel</strong> is on the bar at the bottom. When the reel is done
                it becomes <strong>View your reel</strong>.{" "}
                <strong>Make another reel</strong>, at the foot of the form, brings the build button
                back — on Cinematic that is another short video.
              </span>
              {/* The other thing the same photos can be. Said beside the reel
                  because it is the same form and the same set of pictures. */}
              <span className="block mt-1.5">
                <strong>Post these photos</strong>, at the foot of the form, sends the same photos as
                they are: one post to swipe through on Instagram, Facebook, LinkedIn, Threads, X or
                TikTok. No video is made and nothing comes out of your plan. Pick the accounts, write
                one caption for the post, and send. The order you arranged them in is the swipe order.
                Instagram takes the first ten, and trims a very tall or very wide photo to a shape it
                accepts.
              </span>
              <span className="block mt-1.5">
                No photos to start from? That is a Scenes Reel (step 12).
              </span>
            </Step>
            <Step n={15} title="Your Share Kit — And A Blog Post" icon={FileText}>
              Every video finishes on its <strong>Share Kit</strong>: the title, description and hashtags
              Publish fills in for you, plus an Instagram caption, a LinkedIn post and an email blurb. It also
              holds a <strong>blog article</strong> — usually 1,000 to 1,500 words, titled with the question a
              reader would actually type, headings written the same way and answered in the first line,
              and a <strong>Frequently Asked Questions</strong> section of six questions at the end, chosen
              from what people are asking about that subject in your town. Those six are{" "}
              <strong>AI answer blocks</strong>, built into every article (step 20). That is the shape an AI
              assistant quotes — <strong>AEO</strong> and <strong>GEO</strong>, alongside ordinary SEO.{" "}
              {/* Editing the article (2026-10-16). */}
              To change the words, press <strong>Edit</strong> on the article. The introduction, body
              and conclusion become boxes you can type in, with headings marked <strong>##</strong>.{" "}
              <strong>Save</strong> keeps your changes, and Copy as HTML, the email version, the
              newsletter and BoldTrail all use them. The <strong>Headline</strong> box at the top of
              the article changes its title the same way.{" "}
              <strong>Header image</strong> makes the picture that sits above the headline — a real
              photograph of the kind of place the article is about, with no words drawn into it —
              and <strong>Copy as HTML</strong> then carries it across with the text, so what you
              paste into your site arrives with its image already in place. The same paste includes
              the article&apos;s <strong>schema</strong>, the hidden description that tells search and
              answer engines what the article is, who wrote it, and which parts are questions and
              answers. Some website builders remove it when you paste; the article is unaffected.
              Once an article has a header image, two more buttons appear beside it.{" "}
              <strong>Moving header</strong> turns that picture into a short silent loop of slow
              camera movement, and Copy as HTML then leads with it, keeping the still picture for
              sites that won&apos;t play video. <strong>Social teaser</strong> makes a short vertical
              clip with the headline and a &ldquo;Read the full article&rdquo; card, to download and
              post with a link. Each takes about a minute, neither uses a video from your plan, and
              each can be made up to four times for one article. That gives one recording two places to
              be quoted from: the video&apos;s own description, which is written with a real FAQ block for
              voice search, and the article on your own site. Blog posts never use a video from your plan, and
              you can write one without making a video at all — press the <strong>Blog</strong> card,
              which opens a page of its own with the mic box, Source and Details and{" "}
              <strong>Back</strong> on the bar at the bottom, or start your sentence with
              &ldquo;create a blog&rdquo;.
              {/* Posting to a BoldTrail website, in the owner's steps (2026-10-15). */}
              <span className="block mt-1.5">
                <strong>Posting it on your BoldTrail website.</strong> Press <strong>Copy as HTML</strong>.
                In BoldTrail, open your website (WebIDX), go to <strong>Blog</strong> and press{" "}
                <strong>Add Post</strong>. In the editor, click the <strong>&lt;&gt;</strong> button to
                open the code view, paste, and press <strong>Save</strong>. Give the post its title
                (use the <strong>Headline</strong> from your Share Kit), then <strong>Publish</strong>.
                Once it&apos;s live, open the post, copy its web address from your browser&apos;s address
                bar, and paste it into the email&apos;s link box, so <strong>Read more</strong> in your
                emails and newsletters goes straight to it.
              </span>
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
                drops it into the email tool you already use. With BoldTrail connected,{" "}
                <strong>Send through BoldTrail</strong> under the preview sends it to up to 10 people
                from your BoldTrail address, each greeted by their first name, once the post&apos;s web
                address is in. Without BoldTrail, SparkReels doesn&apos;t send it to your clients for
                you.
              </span>
              {/* The newsletter from several posts, added 2026-10-15. */}
              <span className="block mt-1.5">
                <strong>A newsletter from several posts.</strong> In My Sparks, press{" "}
                <strong>Make a newsletter</strong> above your Blog posts, tick 2 to 5 of them, then{" "}
                <strong>Make the newsletter</strong>. It writes three subject lines, the inbox preview,
                a short note from you, a few lines on each post with its own <strong>Read more</strong>{" "}
                button, and your sign-off. Paste each post&apos;s web address once; a post without one
                has no button. <strong>Copy as HTML</strong> drops it into the email tool you already
                use, and <strong>Send me a test</strong> sends it to you first. With BoldTrail
                connected, it can go to up to 10 people from there too, once every post&apos;s web
                address is in. Without BoldTrail, SparkReels doesn&apos;t send it to your clients for
                you.
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
            <Step n={16} title="Publish To YouTube — One Click" icon={MonitorPlay}>
              Open the finished video in <Link href="/videos" className="text-primary-600 font-medium hover:underline">My Sparks</Link> and
              hit <strong>Publish</strong>. Your AI-generated title, description, and hashtags are attached
              automatically — choose public, unlisted, or private, and you&apos;re live without leaving the app.
              Avatar videos, Cinematic reels, Scenes reels and a camera recording made over AI scenes
              are marked to YouTube as AI-made when they go up, which YouTube asks for. Other videos
              you record yourself and Classic reels are not.
              {/* Failures used to be a toast and nothing else: gone on refresh,
                  with no reason and nothing to retry from. Saying so is the
                  most useful line on this card when something goes wrong. */}
              <span className="block mt-1.5">
                <strong>If a publish fails</strong> — an expired YouTube connection, a channel limit, a
                video still finishing — it isn&apos;t lost in a disappearing message. Open{" "}
                <strong>Publish</strong> on that video again: the top of the window lists where it has
                gone, and a failed one shows the reason with a <strong>Retry</strong> beside it. Once
                a later attempt goes through, the line reads as posted.
              </span>
              <span className="block mt-1.5">
                <strong>If YouTube needs reconnecting</strong>, which happens when Google ends the
                connection on its side, Publish says so and shows a{" "}
                <strong>Reconnect YouTube</strong> link. Your channel is remembered; reconnect and
                publish again.
              </span>
            </Step>
            {/* Rewritten when posting to the other platforms went live. It said
                to download the MP4 and post it by hand, which is still there
                at the end for anywhere that is not connected. */}
            <Step n={17} title="Everywhere Else — From The Same Window" icon={Upload}>
              The <strong>Publish</strong> window lists every account you connected in step 6. Tick the
              ones this video should go to and the button names them — <strong>Publish to
              Facebook</strong>, <strong>Publish to YouTube and Instagram</strong>. Nothing goes out
              until you press it. <strong>Creator</strong> posts each video to YouTube plus three
              others; <strong>Producer</strong> and <strong>Influencer</strong> post to all of them.
              <span className="block mt-1.5">
                <strong>Caption / Post Text</strong> appears as soon as you tick anything besides
                YouTube. It starts with the caption and hashtags written for the video, and what you leave there is
                what gets posted.
              </span>
              <span className="block mt-1.5">
                <strong>First comment</strong> is optional, and is posted under the video on Instagram,
                Facebook, LinkedIn, Threads and TikTok. It is the place for a link, because a link in
                an Instagram caption can&apos;t be clicked and one in a comment can. If you saved your
                blog post&apos;s address for this video, it is already filled in.
              </span>
              <span className="block mt-1.5">
                YouTube is live the moment it finishes. The others take a few minutes to process the
                video, so the window says <strong>On its way</strong> and tells you as each one lands,
                or why one did not. You can close it; the post carries on either
                way.
              </span>
              {/* The answer to "did it post?", which nothing gave once the
                  window was closed. */}
              <span className="block mt-1.5">
                <strong>Where it&apos;s posted</strong>, at the top of the window, is the record for
                that video: one line for each platform, saying posted (with a link to the post), on
                its way, scheduled, or failed and why. A failed line has <strong>Retry</strong>, which
                sends the video to that one platform again. A posted line on Facebook or LinkedIn has{" "}
                <strong>Edit caption</strong>, for fixing the words after it is up; the other
                platforms don&apos;t allow that. Platforms the video is already on start unticked
                when you reopen the window, so it isn&apos;t posted to them twice by accident.
              </span>
              {/* A platform can refuse a post minutes after it was sent. Said
                  here because the reason used to be saved and shown nowhere. */}
              <span className="block mt-1.5">
                <strong>If a post doesn&apos;t go out</strong> after you&apos;ve left the window, you
                are told two ways. A red note appears at the top of{" "}
                <Link href="/videos" className="text-primary-600 font-medium hover:underline">My Sparks</Link>{" "}
                naming the platform, the video and the reason, with <strong>Open Publish</strong> to
                go straight to Retry and <strong>Dismiss</strong> to clear it. And an email goes to
                the address you sign in with. The usual reason is a connection that has expired and
                needs connecting again in Settings.
              </span>
              <span className="block mt-1.5">
                The <strong>thumbnail</strong> you set in the window is sent with the video as its
                cover, not only to YouTube. A vertical video gets a tall version of the same
                thumbnail. Each platform decides whether to show it; some pick a frame of their own.
              </span>
              <span className="block mt-1.5">
                <strong>Google Business</strong> works differently. It takes no more than 30 seconds of
                video and no phone numbers, so a longer video goes up as a photo post with your caption,
                any phone number left out, and a <strong>Learn more</strong> button to your blog post or
                the video. A long caption is trimmed to fit Google&apos;s limit. A video too long for one of the other platforms is skipped there, with the
                reason shown.
              </span>
              <span className="block mt-1.5">
                For an open house, tick <strong>Post to Google as an event</strong> and give it a
                name, the date and the start and end times. Google shows the date on your listing and
                takes the post down by itself afterwards, where an ordinary post would still say
                &ldquo;this Saturday&rdquo; a week later.
              </span>
              <span className="block mt-1.5">
                For anywhere you have not connected, download the MP4 and use the pre-written{" "}
                <strong>Instagram caption, LinkedIn post, and email blurb</strong> from the
                project&apos;s Title, Description &amp; Hashtags card.
              </span>
              {/* Email it, added 2026-10-15. */}
              <span className="block mt-1.5">
                <strong>Email it.</strong> Any finished video in My Sparks can be emailed. Press{" "}
                <strong>Email it</strong>, add up to 10 people from your BoldTrail by their email
                (people you&apos;ve sent a video to before, and your sellers, are one tap), and
                SparkReels writes a short subject and note that you can change or say out loud. Put{" "}
                <strong>{"{first name}"}</strong> in the note and each person sees their own name. The
                email shows a picture from the video with a play button and a{" "}
                <strong>Watch the video</strong> button; email can&apos;t play a video inside the
                message, so a tap opens it. <strong>Send through BoldTrail</strong> asks you to
                confirm, then each person gets their own email from your BoldTrail address. Without
                BoldTrail, copy it into your own email instead. For your whole list, use your email
                tool or BoldTrail&apos;s own campaigns, which handle unsubscribes.
              </span>
            </Step>
          </div>
          <VideoPlaceholder label="Publishing" />
        </Card>

        {/* ── PART 4 ── */}
        <Card padding="sm">
          <p className="text-xs font-bold text-primary-600 uppercase tracking-wide mb-1">Part 4 · The AI Tools Workbench</p>
          <h2 className="text-base font-bold text-brand-text mb-3">Iterate &amp; Improve</h2>
          <div className="flex flex-col gap-4">
            <Step n={18} title="The Everyday Tools" icon={Wand2}>
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
              {/* Added once the owner had seen it show their real reviews. */}
              <span className="block mt-1.5">
                <strong>Google Reviews</strong> shows the reviews on your Google Business profile,
                with your average and how many there are. It needs Google Business connected
                (step 6). <strong>Needs a reply</strong> is ticked to begin with, so you see only
                the ones you haven&apos;t answered; untick it to see them all. On any review,{" "}
                <strong>Draft a reply</strong> writes a short one in your voice for you to edit, or{" "}
                <strong>Write my own</strong> gives you an empty box. Nothing goes to Google until
                you press <strong>Post reply</strong>. A reply you&apos;ve already posted can be
                edited or removed. Read a drafted reply to a low rating with extra care before
                posting it.
              </span>
              {/* Seller Update, added 2026-10-15; any day, From your listings
                  and the video update the same day. */}
              <span className="block mt-1.5">
                <strong>Seller Update</strong> writes an update email to the people selling one of
                your listings, whenever you want to send one. Add the listing once: the address, the
                sellers&apos; first names, the list price and the date it was listed. If you&apos;ve
                already made a video or reel of it in Listings &amp; photos, pick it under{" "}
                <strong>From your listings</strong> and the address fills in. For each update, fill
                in online views, saves, showings, open house visitors and offers, and type or say the
                buyer feedback and next steps. Your last update&apos;s numbers show beside each box,
                and the email shows the new ones as a row of numbers with what went up. It uses only
                what you enter. Past updates are listed under the listing.{" "}
                <strong>Record a video update</strong> writes a short script from your numbers and
                opens the camera with it; when you&apos;ve recorded,{" "}
                <strong>Add to the seller update</strong> puts the video at the top of the email,
                where sellers tap it to watch. Your listings also sit under{" "}
                <strong>Seller updates</strong> in My Sparks, each with a <strong>New update</strong>{" "}
                button. With BoldTrail connected, add the sellers by their email under{" "}
                <strong>Sellers in BoldTrail</strong>, once per listing, and{" "}
                <strong>Send to sellers through BoldTrail</strong> emails each of them the update,
                video included, after you confirm, with an optional short text to say it&apos;s on its
                way. The update then shows when it was sent and to whom. Copy it or send yourself a
                test, the same as the newsletter.
              </span>
              {/* The menu's Meet button, 2026-10-20; the owner's wording. */}
              <span className="block mt-1.5">
                <strong>Google Meet</strong> — <strong>Meet</strong> in the top bar on a computer, or in
                the menu on your phone. <strong>Start now</strong> opens a new Google Meet in a new tab;
                copy the link and send it to your client. <strong>Schedule for later</strong> asks for your
                client&apos;s name and email, the date, the time and how long, then opens Google Calendar
                with it all filled in: press <strong>Save</strong>, then <strong>Send</strong> to email them
                the invite. Calendar adds the Meet link; if none appears, click{" "}
                <strong>Add Google Meet video conferencing</strong> before saving. The meeting shows in{" "}
                <strong>Spark Calendar</strong> right away as a gold camera on its day; tap it to open that
                day in Google Calendar, or <strong>Remove</strong> it if you didn&apos;t save it in Google.
              </span>
            </Step>
            {/* The graphics tools, which were not described anywhere — and the
                counting rule, which is the thing people actually need to know
                before they press a button that spends something. */}
            <Step n={19} title="Graphics Without A Designer" icon={ImageIcon}>
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
                <strong>Use as blog header</strong> sends it straight to the article it belongs to.{" "}
                <strong>Post it</strong> sends the finished graphic to your connected accounts as a
                photo post, with a caption you write, instead of downloading it first.
              </span>
              {/* Not described anywhere until now. The badge is the part people
                  ask about: it used to come back even with both boxes empty. */}
              <span className="block mt-1.5">
                The <strong>Thumbnail Generator</strong> makes the cover picture for a video. Pick
                the video, type the few words you want on it or leave that blank and AI writes
                them, and choose the photo. Afterwards you can change the words or the photo and
                press <strong>Update Thumbnail</strong>, which redraws it in seconds on the same
                background. The <strong>Market Badge</strong> is the city and state shown on it.
                Type a different one to change it, which also updates the video&apos;s market so its
                title and description match, or clear both boxes and press Update Thumbnail to
                leave the badge off.
              </span>
              <span className="block mt-1.5">
                <strong>Banners</strong> makes the wide image across the top of your YouTube channel,
                your LinkedIn profile or your Facebook page, each at the size that site wants. For
                YouTube, press <strong>Use this template</strong> and your photo, logo, name and contact
                details fill in from Settings. Change any of it, and everything stays inside the part
                every phone and TV shows. The LinkedIn and Facebook banners let you put your photo on the
                left or the right and add QR codes to your site. Pick a color palette or choose{" "}
                <strong>Custom</strong> and set your own colors. Download the picture, or use{" "}
                <strong>Download for Canva (PDF)</strong> for a copy meant to be opened in Canva, where
                you can change the text and colors yourself.
              </span>
            </Step>
            <Step n={20} title="AI Answer Blocks — Get Cited By AI Search" icon={Bot}>
              Buyers ask ChatGPT and Perplexity things like &ldquo;which neighborhood should I buy in?&rdquo;
              months before they call an agent. On <strong>Create</strong>, under the topic box,{" "}
              <strong>What buyers ask AI</strong> shows a question buyers in your city are asking right
              now, using the city in Settings unless you type another in Details.{" "}
              <strong>Show more</strong> opens the rest, and <strong>Record this</strong> makes one your
              topic, so the video answers it.
              <span className="block mt-1.5">
                <strong>Every blog article already has answer blocks.</strong> The six questions at the end
                of each article in your Share Kit (step 15) are written the way AI assistants quote, for
                that article&apos;s topic, so there is nothing extra to make.
              </span>
              <span className="block mt-1.5">
                The full tool is the first tab in <strong>Spark Tools</strong>. For each question it also
                gives a ready-to-paste block for your website and a <strong>Record on Camera</strong>{" "}
                shortcut straight to the teleprompter.
              </span>
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
          <h2 className="text-base font-bold text-brand-text mb-4">Sparks, Insights And The Calendar</h2>
          <div className="flex flex-col gap-4">
            <Step n={21} title="What A Spark Is" icon={Sparkles}>
              A <strong>Spark</strong> is one idea and everything that came out of it: the script, the
              video or videos made from it, the article, the captions, and where each has been
              published. One topic, one Spark — even if you make a short version, a long version and a
              reel from it.
              <span className="block mt-1.5">
                Two places in the menu use the word, and they hold different things.{" "}
                <Link href="/videos" className="text-primary-600 font-medium hover:underline">My Sparks</Link>{" "}
                is your <strong>library</strong>: the finished videos and drafts themselves, to watch,
                download, publish or delete. To delete several at once, press <strong>Select</strong>{" "}
                on the Videos or Blog posts heading, tick them, and press <strong>Delete</strong>. The{" "}
                <strong>All Sparks</strong> panel inside Spark
                Calendar lists the <strong>Sparks</strong> — open one and you get its card, holding the
                article, the captions, the schedule and how it&apos;s performing.
              </span>
            </Step>
            {/* The Dashboard and Spark Insights became one page on 2026-10-14. */}
            <Step n={22} title="Spark Insights — What You Have And How It Did" icon={BarChart2}>
              <Link href="/analytics" className="text-primary-600 font-medium hover:underline">Spark Insights</Link>{" "}
              opens with what you have left — short videos, long videos, and whether camera recording
              is unlocked with the days remaining — a <strong>Getting Started</strong> checklist that
              disappears once you&apos;ve finished it, and buttons to create a video or open the
              calendar. Your five most recent projects are at the bottom to pick back up.
              <span className="block mt-1.5">
              Then it looks backwards. How many videos you&apos;ve made and published, a
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
              </span>
            </Step>
            <Step n={23} title="Spark Calendar — When It Goes Out" icon={CalendarDays}>
              The calendar puts every dated item — published or scheduled — on a month, week or list
              view, with the <strong>All Sparks</strong> panel beside it for everything that has no
              date yet. Open any Spark from either side to reach its card. This one is still rolling
              out: it appears in your menu when your account has it.
            </Step>
            {/* The affiliate program (2026-10-17), worded as the owner approved. */}
            <Step n={24} title="Earn With The Affiliate Program" icon={DollarSign}>
              Recommend SparkReels and earn <strong>20% of what each customer you refer pays, every
              month for their first 12 months</strong>. Open <strong>Affiliate</strong> in the menu and
              press <strong>Apply to join</strong>, or use <strong>Affiliates</strong> at the bottom of
              the website, and tell us a little about how you&apos;d share SparkReels. When you&apos;re
              approved, you&apos;ll get an email titled{" "}
              <strong>&ldquo;You&apos;re approved — welcome to the SparkReels affiliate program&rdquo;</strong>{" "}
              with your referral code, your referral link and two steps. First, open the link in it
              while signed in, to connect the program to your account. Then, on the{" "}
              <strong>Affiliate</strong> page, connect your bank with Stripe to get paid. Payouts are
              sent monthly. If the email hasn&apos;t arrived, look in spam.
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
            <li><strong>Publish:</strong> one window sends it to YouTube and the other accounts you connected, with title, description, and tags attached</li>
            <li><strong>For a listing:</strong> a Classic photos only reel is free; Cinematic or a listing video uses one short video</li>
            <li><strong>No photos and no camera:</strong> Voice over only makes a Scenes Reel from a topic, up to 3 minutes, for one short video</li>
            <li><strong>Mix in</strong> free camera videos — YouTube&apos;s algorithm loves 8–15 minute authentic long-form</li>
            <li><strong>Every one</strong> also gives you a blog article for your own site, which costs nothing from your plan</li>
          </ol>
          {/* Still no link: the Spark Calendar is behind feature_access, so
              sending most people to it would be pointing them at a 404. Part 5
              now explains what it is, so this only has to say where it appears. */}
          <p className="text-xs text-slate-400 mt-3">
            Part 5 covers <strong>Sparks</strong> and <strong>Spark Insights</strong> — where your
            work lives and how it&apos;s doing. The{" "}
            <strong>Spark Calendar</strong> described there is still rolling out, and appears in your
            menu when your account has it.
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
