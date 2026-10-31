import { Card } from "@/components/ui/card";
import Link from "next/link";
import { canAccessFeature } from "@/lib/access";
import { getServerAccess } from "@/lib/access-server";
import { FreeOverview } from "@/components/help/free-overview";
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

/**
 * One numbered step. Its id is step-N, or `anchor` when What's New links to
 * it (lib/data/whats-new.ts howItWorksAnchor), so /help#anchor lands on it.
 */
function Step({ n, title, icon: Icon, anchor, children }: {
  n: number; title: string; icon: React.ElementType; anchor?: string; children: React.ReactNode;
}) {
  return (
    <div id={anchor ?? `step-${n}`} className="flex scroll-mt-20 items-start gap-3">
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

/**
 * Free vs paid (2026-10-28, the owner's brief): paid plans and admins get the
 * whole guide; a free account gets a short overview with the workflows
 * locked. Decided on the server, so the full guide is never sent to a free
 * account at all, not merely hidden. (Ask Sparklee is held to the same line
 * in lib/help/page-guide.ts.)
 */
export default async function HelpPage() {
  const { level } = await getServerAccess();
  const full = canAccessFeature(level, "full_how_it_works");
  return (
    // Full width, at the owner's request (2026-10-13): held to a narrow
    // column, the guide "looked so long on the page".
    <div className="w-full">
      {/* Hero. New wording 2026-10-28, with no time promise. */}
      <div className="mb-6 p-6 rounded-2xl spark-banner-gradient text-white">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
            <Rocket size={18} />
          </div>
          <h1 className="text-xl font-bold text-spark-ink">How It Works</h1>
        </div>
        <p className="text-sm text-primary-100">
          Learn how to use SparkReels step by step—from creating your first Spark to publishing, connecting your
          tools, and using advanced features.
        </p>
        <p className="mt-1.5 text-sm text-primary-100">
          Use this section whenever you need help understanding a feature or setting up a workflow.
        </p>
      </div>

      {full ? <FullGuide /> : <FreeOverview />}
    </div>
  );
}

function FullGuide() {
  return (
      <div className="flex flex-col gap-5">

        {/* Getting around: the top menu and the Settings tabs, both new on
            2026-10-14. Not a numbered step, so the steps keep their numbers. */}
        <Card padding="sm">
          <p className="text-xs font-bold text-primary-600 uppercase tracking-wide mb-1">Before You Start</p>
          <h2 className="text-base font-bold text-brand-text mb-3">Getting Around</h2>
          <ul className="flex flex-col gap-2 text-sm text-slate-600 leading-relaxed list-disc pl-5">
            <li>
              <strong>The menu is on the left side and across the top</strong> on a computer, the same
              pages in both: Home, Spark Studio, My Sparks, AutoSparks, Spark Tools, Spark Calendar, Spark
              Insights, Settings, What&apos;s New, How It Works and Affiliate. <strong>Home</strong> is
              where you land when you sign in, and the logo always takes you back to it. The side menu
              also has <strong>Google Meet</strong> and <strong>Sign Out</strong>, and stays put as you scroll.{" "}
              <strong>What&apos;s New</strong> shows the latest features, with a gold dot when there is
              one you haven&apos;t seen; each has <strong>Learn How It Works</strong>, which brings you to
              its step here. The page you are on is highlighted on the side and underlined on top. On a
              smaller window the last few top names are under <strong>More</strong>; on a phone, tap{" "}
              <strong>☰</strong>.
            </li>
            <li>
              <strong>Settings has four tabs.</strong> <strong>Profile</strong> (steps 1–8) holds your
              brand, market, voice, closing call to action, import address and password.{" "}
              <strong>Social Accounts</strong> (step 9) is where YouTube and your other platforms are
              connected, plus your Google review link. <strong>CRM</strong> (step 10) holds BoldTrail,
              GoHighLevel and your Halo website. <strong>Billing</strong> (step 11) is your plan and buying
              more videos. At the top of Profile, <strong>Your studio: 6 of 8 ready</strong>{" "}
              lists the eight things that make your videos look and sound like you; each one still to do
              has a button that takes you to it.
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

        {/* Home (2026-10-29, the owner's agentic dashboard). Not a numbered
            step, so every step below keeps its number. */}
        <Card padding="sm">
          <p className="text-xs font-bold text-primary-600 uppercase tracking-wide mb-1">Start Here</p>
          <h2 className="text-base font-bold text-brand-text mb-3 scroll-mt-20" id="home">Home — Tell Sparklee What You Want</h2>
          <ul className="flex flex-col gap-2 text-sm text-slate-600 leading-relaxed list-disc pl-5">
            <li>
              <strong>Ask Sparklee</strong> is the big box at the top: <em>What do you want to accomplish?</em>{" "}
              Tap the <strong>mic</strong> and say it, or type it, then press <strong>Send</strong>. For
              example: &ldquo;Keep me visible to sellers in my town this week&rdquo; or &ldquo;I haven&apos;t
              posted this week. What should I make?&rdquo; The <strong>Try saying</strong> buttons under it
              ask for you.
            </li>
            <li>
              Sparklee checks your plan, the videos you have left, the accounts you&apos;ve connected and your
              CRM, then shows her <strong>plan</strong>: each video, the day it would post and where, plus any
              step you finish yourself in a tool (a seller update or a review request, for example). Under it
              she says how many of your remaining videos it would use. If it needs an account you
              haven&apos;t connected, she says so with a link to connect it.
            </li>
            <li>
              <strong>Edit plan</strong> lets you change a day or remove a step. <strong>Approve plan</strong>{" "}
              writes the drafts: script, blog article, title and thumbnail. <strong>No video is made and
              nothing is used from your plan yet.</strong> Each draft waits in <strong>Needs Your Approval</strong>,
              where you press <strong>Make video</strong>, watch it, then <strong>Approve</strong> to post.
              Nothing posts, sends or contacts anyone without your approval.
            </li>
            <li>
              <strong>Or create it yourself:</strong> the row under Ask Sparklee opens Spark Studio on Video /
              Reel, Camera, Blog or Listing, or Spark Tools, for when you want full control.
            </li>
            <li>
              <strong>Needs Your Approval</strong> lists drafts from AutoSparks, Halo, email and Sparklee, and
              seller updates. A finished video has <strong>Watch</strong> and <strong>Approve</strong> right
              there; one not made yet has <strong>Make video</strong>, which opens AutoSparks.
            </li>
            <li>
              <strong>Opportunities Sparklee Found</strong> come from real signs: a new page on a site you watch
              (Halo or your own website), a post that got well above your usual views, an account with nothing
              posted for a week or more, a listing with no seller update this week or one that just wrapped up,
              open days coming up, videos left close to your plan renewing, and questions buyers research about
              your town. <strong>Make draft</strong> hands it to Sparklee as a request, so you see her plan first.
            </li>
            <li>
              <strong>Working For You</strong> shows what&apos;s happening right now: videos rendering, videos
              waiting in line, drafts being prepared, approved videos waiting for their day, posts booked, and
              what posted recently. It never guesses how long something will take.
            </li>
            <li>
              <strong>This Week</strong> shows each day: green is posted, blue is booked, gold is waiting on you,
              and an open day has <strong>+ Open</strong>, which asks Sparklee to plan something for it.{" "}
              <strong>Calendar →</strong> opens Spark Calendar. It shows what SparkReels posts or schedules, not
              posts you make directly on the platforms.
            </li>
            <li>
              Below that: <strong>Your Plan</strong> (videos left, AI images used, when it renews),{" "}
              <strong>Quick Insights</strong> (views on the last 30 days of posts, posts this week, your top post),{" "}
              <strong>What&apos;s New</strong> and your latest <strong>Sparks</strong>. New accounts also see the{" "}
              <strong>Getting Started</strong> checklist here until it&apos;s done.
            </li>
          </ul>
        </Card>

        {/* ── PART 1 ── */}
        <Card padding="sm">
          <p className="text-xs font-bold text-primary-600 uppercase tracking-wide mb-1">Part 1 · One-Time Setup</p>
          <h2 className="text-base font-bold text-brand-text mb-4">Set Up Once (~10 Minutes)</h2>
          <div className="flex flex-col gap-4">
            {/* Part 1 follows Settings, and each step's number is the number on
                that Settings section (2026-10-24, the owner's ask). */}
            <Step n={1} title="Set Your Market And Video Language" icon={MapPin}>
              In <Link href="/settings#preferences" className="text-primary-600 font-medium hover:underline">Settings → Profile → 1 · Content Preferences</Link>,
              enter your city, state, and video language.
              This powers live local market research, trending topics, and auto-localized templates.
            </Step>
            <Step n={2} title="Create Your AI Voice" icon={Mic}>
              In <Link href="/settings#voice" className="text-primary-600 font-medium hover:underline">Settings → Profile → 2 · AI Voice Clone</Link>, record or upload about 30 seconds of your voice.
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
            <Step n={3} title="Complete Your Brand Profile" icon={User}>
              In <Link href="/settings#brand" className="text-primary-600 font-medium hover:underline">Settings → Profile → 3 · Brand &amp; AI Profile</Link>, add
              your name, brokerage, phones, website, and license number. Upload your <strong>logo</strong> and
              your <strong>photos</strong> — they become your AI Photo Avatar, and your contact card
              and logo appear automatically in every video.
              {/* Two photo slots (2026-10-29, the owner's ask). */}
              <span className="block mt-1.5">
                <strong>Add two photos for the best videos:</strong> a <strong>Vertical</strong> one (phone upright)
                for Reels and Shorts, and a <strong>Horizontal</strong> one (phone sideways) for YouTube. Each video
                uses the one that fits its shape; with only one photo, its sides are filled to fit. On the free
                plan you have one photo: choose <strong>Vertical</strong> or <strong>Horizontal</strong> for the
                shape you post most.
              </span>
            </Step>
            {/* Back since 2026-10-20: HeyGen confirmed API twins need no
                Enterprise plan. The owner's wording. */}
            <Step n={4} title="Make Your Digital Twin (Optional)" icon={Video}>
              Your Digital Twin is a lifelike video of you that talks and moves like you. In{" "}
              <strong>Settings → Profile → 4 · Digital Twin</strong> (inside Brand &amp; AI Profile), record about 2 minutes of yourself
              talking to the camera: phone at eye level, good light, quiet room, only you in the shot.
              Upload it or pick a recording from the Camera tab, then tap{" "}
              <strong>Train Digital Twin</strong>. It&apos;s ready in 15 to 30 minutes, and it shows up
              as an avatar look in every video. On the free plan your twin appears in{" "}
              <strong>Avatar (You) in circle</strong>; on paid plans it works in{" "}
              <strong>Avatar (You in full) video</strong> too. A <strong>vertical</strong> video
              shows you in the room you filmed in. Your twin needs your{" "}
              <strong>approval once</strong>, right after it&apos;s trained: Settings shows{" "}
              <strong>Approval Required</strong>. Press <strong>Approve My Digital Twin</strong>, follow the
              short approval on camera, and you come back to SparkReels with it marked approved (if
              not, press <strong>I&apos;ve approved it</strong>). Until then it can&apos;t be used in a video;
              if you try, the video setup offers <strong>Approve now</strong> and nothing is charged.
              In <strong>Avatar in circle</strong>, the circle follows you as you move.
              You can delete your twin any time in Settings.
              {/* Two twins (2026-10-29, the owner's ask). */}
              <span className="block mt-1.5">
                <strong>Two twins, one of each shape.</strong> On paid plans, make a <strong>Vertical twin</strong>{" "}
                (phone upright) for Reels and Shorts and a <strong>Horizontal twin</strong> (phone sideways) for
                YouTube; each video uses the one that fits, so you&apos;re full screen in both. Each is trained and
                approved on its own. With only an upright twin, a YouTube video shows you in a corner over
                full-screen footage. On the free plan you have one twin: choose the shape you post most.
              </span>
              {/* Digital Twin backgrounds (2026-10-24, the owner's mockup; Photos & footage 2026-10-31). */}
              <span className="block mt-3 scroll-mt-20 font-semibold text-brand-text" id="digital-twin-backgrounds">Backgrounds for your twin</span>
              <span className="block mt-1">
                Your twin is filmed upright, so in a horizontal video your own background can be taken away.
                In video setup for a horizontal <strong>Avatar video</strong>, under <strong>Background</strong>,
                press <strong>On my background</strong>, then pick:
              </span>
              <span className="block mt-1">
                <strong>Photos &amp; footage</strong>: you stand in front of the video&apos;s own photos and
                clips as they play. Under <strong>Where you stand</strong>, choose <strong>Side</strong> (full
                height) or <strong>Corner</strong> (smaller). Short videos only.
              </span>
              <span className="block mt-1">
                <strong>A saved background or a color</strong>: you stand full size in front of one picture.
                Your <strong>Agent Intro</strong> always uses one of these.
              </span>
              <span className="block mt-1">
                In <strong>Settings → 4 · Digital Twin</strong>, <strong>Wide videos</strong> sets what new
                videos start on: <strong>Me on my footage</strong>, <strong>Me on my background</strong>, or{" "}
                <strong>Avatar in circle</strong>. <strong>Your backgrounds</strong> keeps your pictures: a
                color, a town photo, or press <strong>+ Describe</strong>, type or say a place and press{" "}
                <strong>Make it</strong> (about 20 seconds). Tap one to make it your default. Up to 20 new
                backgrounds a month.
              </span>
              {/* Twin outfits (2026-10-28, the owner's ask). */}
              {/* Paid plans only (2026-10-28): data-paid-only keeps it out of a free account's Sparklee. */}
              <span className="block mt-3 scroll-mt-20 font-semibold text-brand-text" id="twin-outfits" data-paid-only="true">Outfits for your twin (paid plans)</span>
              <span className="block mt-1" data-paid-only="true">
                Want your twin in something else? In <strong>Settings → 4 · Digital Twin</strong>, under{" "}
                <strong>Outfits</strong>, describe it (like <em>navy blazer over a white shirt</em>) and press{" "}
                <strong>New outfit</strong>. It takes a minute or two, and it moves like your twin. Each outfit
                then shows up as a look in video setup and works everywhere your twin does, approval and
                backgrounds included. Your first new look each month is free; after that each one uses one
                short video. Tap the bin on an outfit to remove it. The <strong>New look</strong> under your
                photo avatar changes only the photo avatar, not your twin.
              </span>
            </Step>
            <Step n={5} title="Set Your Default Video CTA" icon={Megaphone}>
              In <Link href="/settings#cta" className="text-primary-600 font-medium hover:underline">Settings → Profile → 5 · Default Video CTA</Link>, add your years in real estate and review the
              pre-written closing call-to-action. It auto-fills your name, team, and <em>each video&apos;s</em> city —
              edit it once and every video ends with a proven subscribe-and-contact close. Change it
              later and it carries into videos you have already started, unless you typed over the
              closing line in that video; <strong>Use my saved CTA</strong> there brings it back. Keep it to{" "}
              <strong>40 words</strong> (about 17 seconds): the count under the box shows yours with your
              details filled in, because it&apos;s spoken inside your 2-minute video.
            </Step>
            {/* Setup rather than creating, because the useful half is done once:
                saving the address. After that it is a Forward button in whatever
                mail app you already live in. */}
            <Step n={6} title="Save Your Import Address" icon={Mail}>
              In <Link href="/settings#email-import" className="text-primary-600 font-medium hover:underline">Settings → Profile → 6 · Import Articles By Email</Link>{" "}
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
              {/* Email drafts (2026-10-24). */}
              <span className="block mt-1.5">
                On a paid plan, each email you forward also becomes a video draft on the{" "}
                <Link href="/autosparks" className="text-primary-600 font-medium hover:underline">AutoSparks</Link>{" "}
                page, ready to approve (step 16).
              </span>
            </Step>
            <Step n={7} title="Put SparkReels On Your Phone" icon={PlayCircle}>
              <Link href="/settings#phone" className="text-primary-600 font-medium hover:underline">Settings → Profile → 7 · Put SparkReels on your phone</Link>{" "}
              shows how to open SparkReels like an app, one tap from your Home Screen.
              <span className="block mt-1.5">
                <strong>iPhone:</strong> open sparkreels.ai in <strong>Safari</strong>, tap{" "}
                <strong>Share</strong> (the square with an arrow), then <strong>Add to Home Screen</strong>.{" "}
                <strong>Android:</strong> open it in <strong>Chrome</strong>, tap the <strong>⋮</strong> menu,
                then <strong>Add to Home screen</strong> (or <strong>Install app</strong>). On a phone that
                can install it straight away, the card has a button for it.
              </span>
            </Step>
            <Step n={8} title="Your Account" icon={User}>
              <Link href="/settings#account" className="text-primary-600 font-medium hover:underline">Settings → Profile → 8 · Account</Link>{" "}
              is where you set or change your password (if you signed in with Google, you can add one
              here), sign out, or delete your account.
            </Step>
            <Step n={9} title="Connect YouTube And Your Other Accounts" icon={MonitorPlay}>
              In <Link href="/settings/social" className="text-primary-600 font-medium hover:underline">Settings → 9 · Social Accounts</Link>,
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
              {/* Moved here from Profile (2026-10-30, the owner's ask). */}
              <span className="block mt-1.5 scroll-mt-20" id="review-link">
                <strong>Your Google review link</strong> is at the bottom of this tab (paid plans). In your
                Google Business Profile, press <strong>Ask for reviews</strong> → <strong>Copy link</strong>,
                paste it here and press <strong>Save</strong>. It&apos;s the gold button in your review request
                emails. Under it you can save your <strong>default review request words</strong> and subject,
                which fill in each time you ask for a review.
              </span>
            </Step>
            <Step n={10} title="Connect Your CRM" icon={Rocket}>
              <Link href="/settings/crm" className="text-primary-600 font-medium hover:underline">Settings → 10 · CRM</Link>{" "}
              sends your work to the CRM you already use.
              <span className="block mt-1.5">
                <strong>BoldTrail.</strong> If you use BoldTrail, SparkReels can email your sellers and
                clients through it, from your own BoldTrail address, and BoldTrail keeps each email on
                that contact&apos;s record. In BoldTrail, go to Lead Engine → Lead Dropbox → My API
                Tokens, tick <strong>Contacts</strong>, press <strong>Generate</strong> and copy the
                token. Then paste it into the <strong>BoldTrail</strong> box in Settings → 10 · CRM and press <strong>Connect</strong>. It&apos;s saved securely and shown only
                by its last four characters; <strong>Disconnect</strong> removes it. If BoldTrail
                won&apos;t send with a Contacts token, make one with <strong>All</strong> ticked.
                Tokens last a year.
              </span>
              <span className="block mt-1.5">
                <strong>GoHighLevel and other CRMs.</strong> Every video you finish can be sent to your
                CRM automatically, with its title, a short caption, the link, the thumbnail and your name,
                so a workflow there can text it, email it or post it for you. In GoHighLevel, create a
                workflow with an <strong>Inbound Webhook</strong> trigger and copy its address. In SparkReels
                press <strong>Set up for GoHighLevel</strong>, paste the address, keep{" "}
                <strong>Video published</strong> ticked and save. <strong>Test</strong> sends a sample with
                the same fields a real video has, so GoHighLevel can learn them. Want it done for you? Press{" "}
                <strong>Ask for the workflow</strong> on the GoHighLevel card and we&apos;ll email you a
                ready-made one with step-by-step instructions. Any tool that takes a webhook (Zapier, Make
                and others) works the same way.
              </span>
              {/* The Halo website card moved here from Profile (2026-10-30). */}
              <span className="block mt-1.5">
                <strong>Your Halo website</strong> is on the same tab, under CRM Integration. Step 16 explains
                what it does.
              </span>
            </Step>
            <Step n={11} title="Your Plan And Buying More Videos" icon={DollarSign}>
              <Link href="/settings/billing" className="text-primary-600 font-medium hover:underline">Settings → 11 · Billing &amp; Plan</Link>{" "}
              shows your plan, when it renews, and what you have left this month.
              <span className="block mt-1.5">
                Every plan includes <strong>4 short videos</strong> a month; Producer adds 2 long videos and
                Influencer 4. They reset each billing month. Blog posts, camera recordings and AutoSparks
                drafts don&apos;t use any. Need more? <strong>Buy More Videos</strong> adds one short video
                for $25 or one long video for $29, and bought videos never expire; your plan&apos;s videos
                are used first. The AutoSparks page shows <strong>Videos left this month</strong>, and a
                draft you have no video left for says <strong>Needs 1 more video</strong>: pressing Approve
                on it offers to upgrade or buy one.
              </span>
              <span className="block mt-1.5">
                <strong>Manage Billing</strong> changes your plan or card, or cancels. A cancelled plan stays
                active until the end of the month you paid for.
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
                  <td className="py-2 pr-3">You on screen, with b-roll and graphics made for you. Up to 2 minutes</td>
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
              * Unlimited on any paid plan. On the free 100-agent beta, camera recording, blog posts and every AI Tool are unlimited for 14 days starting the day you generate your free video.
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
            <Step n={12} title="Start With The Topic, Then Choose What To Make" icon={Sparkles}>
              <Link href="/create" className="text-primary-600 font-medium hover:underline">Spark Studio</Link>{" "}
              has two sections, then <strong>More options</strong>. <strong>1 · Topic</strong> — one card with
              the mic and a box, <strong>What do you want to create?</strong>, where you say or type what
              it&apos;s about (step 13). Right under the box, a row of four ideas with your town filled
              in; <strong>More ideas</strong> opens the full list.{" "}
              <strong>2 · Create</strong> — four
              cards: <strong>Video / Reel</strong>, <strong>Camera/Teleprompter</strong>,{" "}
              <strong>Blog</strong> or <strong>Listings &amp; photos</strong>. Video / Reel stays on
              this page; the other three each open a page of their own, with{" "}
              <strong>Back</strong> on the bar at the bottom to return here. A topic you
              already said or typed comes with you.{" "}
              <strong>More options</strong> folds the rest away until you want it:{" "}
              <strong>3 · Script Source</strong> — <strong>AI writes it</strong> from
              a topic, or <strong>My Content/Forwarded in</strong>, which is also where anything
              you forwarded in turns up (step 6). A listing or a photos only reel skips this
              one (step 19). <strong>4 · Details</strong> — the city and state, who
              it&apos;s for, and a video&apos;s format. Details opens by itself when your city and
              state are missing, since Next needs them.
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
                has nobody on screen: it is a Scenes Reel (step 17). Each uses one short video. If
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
                forwarded to your import address (step 6). On a video you then say what happens to
                them: <strong>Speak it word for word</strong>, for a finished script, or{" "}
                <strong>Have AI write from it</strong>, which either writes a new script from it or
                shortens an article of your own. To write a new one, press{" "}
                <strong>Write my script from the link</strong> (or the PDF or email); type something in{" "}
                <strong>Anything to focus on?</strong> first if you want it to lean one way. The script comes
                back for you to read before anything is made. <strong>+ Opening line</strong> under it adds a
                line spoken first, which also becomes the video&apos;s title. If an email&apos;s subject names a town, the city and state fill in
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
            <Step n={13} title="Speak It Or Type It — Your Choice" icon={Mic}>
              {/* Ask Sparklee, added 2026-10-14; her badge and the card on the
                  steps bar, 2026-10-15. */}
              <span className="block mb-1.5">
                Need help on a section? Tap <strong>Ask Sparklee</strong>, the gold star just under the top
                bar on the right of every page, and ask
                out loud how to do something. She answers in a few seconds, out loud and on screen, from
                this guide. Each conversation runs up to five minutes. Five conversations a day before you
                pick a plan, twenty a day on one.
              </span>
              {/* One card now: the mic and the box together, at the top, where
                  signing in lands. Example towns are generic on purpose. */}
              The Topic card at the top of Spark Studio reads{" "}
              <strong>What do you want to create?</strong> It has one mic and one box, and
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
              {/* Tell Sparklee, she does it (2026-10-26). */}
              <span className="block mt-1.5">
                <strong>Sparklee, make it</strong> (paid plans), the button under the box, has Sparklee
                do the whole video herself. Say it all at once, for example{" "}
                <em>&ldquo;Make a market update for Springfield this week, horizontal, my twin, post it
                Friday&rdquo;</em>. She asks only for what&apos;s missing (the topic, or the town). Then
                she shows <strong>I&apos;ll create:</strong> with what she&apos;ll make (who&apos;s on
                screen and the voice, the town, the size, the length and the ending) and waits.{" "}
                <strong>Change details</strong> takes you to the choices below the box instead. Press{" "}
                <strong>Create it</strong> and she writes the script, blog, title and thumbnail and makes the video, which takes about
                10 to 12 minutes. It comes back as a card under the box, and on AutoSparks under{" "}
                <strong>From Sparklee</strong>: <strong>Watch</strong>, <strong>Edit thumbnail</strong>,{" "}
                <strong>Edit title and caption</strong>, then <strong>Approve to post</strong>. Nothing
                posts until you approve it. It posts to the accounts you used last time, on the day you
                said (or the next day), at your Halo time. Don&apos;t post it yourself as well. On the free
                plan, or for a blog or a camera take, she fills the page in instead and you press Next.
              </span>
              <span className="block mt-1.5">
                A blog is written straight away. A video stops at its script, so nothing comes out
                of your plan until you choose to make it. The script&apos;s length follows the
                format: up to <strong>90 seconds</strong> for Vertical, up to{" "}
                <strong>2 minutes</strong> for Horizontal, and up to <strong>8 minutes</strong> for
                Longform.
              </span>
              <span className="block mt-1.5">
                Say <em>&ldquo;make a reel about&hellip;&rdquo;</em> and it makes a Voice over only
                Scenes Reel (step 17). Say who&apos;s in it, as in <em>&ldquo;a reel with my
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
                <strong>What buyers ask AI</strong> (step 25), and under that <strong>Or try</strong>:
                ideas with your city filled in, with <strong>More ideas</strong> opening the whole list
                and a search box. Tap one and it lands in the same box the mic writes into, so you can
                add to it before you send. The first chip, <strong>👋 Agent Intro</strong>, is a short
                video introducing you: your name, brokerage, area and years are filled in from Settings,
                you pick who you help most and add anything personal or your profile link. It runs about{" "}
                <strong>30 seconds</strong>. You get the intro script plus a short and a long bio
                in the Share Kit. It&apos;s you, full screen, and with your Digital Twin it&apos;s made
                on our most lifelike avatar. Producer and Influencer get <strong>one free every
                month</strong>; otherwise it uses 1 short video (on the free plan, your free video).
                Either way, AI researches live market data for your city and writes a
                broadcast-quality script with real stats.
              </span>
            </Step>
            <Step n={14} title="Review & Edit The Script" icon={Wand2}>
              Pick your favorite <strong>hook</strong> — it becomes the video title too, so the two never
              disagree. Edit the script freely; a live word counter keeps you inside the cap. Your{" "}
              <strong>Call To Action</strong> is on the next screen, in Video setup under Music: it is spoken
              after your script, so edit it there, or tick <strong>No call to action</strong> to end
              the video on your script. <strong>Regenerate</strong> redoes it from the same topic — it asks first, since
              it discards your edits.
              {/* Listen (2026-10-21). */}
              <span className="block mt-1.5">
                <strong>Listen</strong> reads your script aloud in your own cloned voice, so you hear how
                the video will sound before you make it. <strong>Listen to the article</strong> does the
                same for the blog post in your Share Kit, and each AutoSparks draft has{" "}
                <strong>Listen</strong> too. The first time takes a few seconds for a script, up to about
                a minute for a long article; after that it plays at once. Pause or stop any time. With no
                voice clone yet, it reads in a standard voice.
              </span>
            </Step>
            <Step n={15} title="Choose Format And Who's On Screen — Then Generate" icon={Video}>
              Pick a <strong>format</strong>: <strong>Vertical 9:16</strong> for Reels, Shorts and TikTok, or{" "}
              <strong>Horizontal 16:9</strong> for YouTube and websites — both up to 2 minutes — or{" "}
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
                for you. Up to 2 minutes, so it is not offered for Longform. It takes a script of up
                to 290 words, counting your closing line. If yours is longer, Avatar video is greyed
                out and a note under the choices says how many words you have. Press{" "}
                <strong>Shorten to fit</strong> and the script is cut to fit, or{" "}
                <strong>Shorten closing line</strong> to trim your closing line yourself. With your
                Digital Twin it is a full Avatar video too, vertical or horizontal.
              </span>
              <span className="block mt-1.5">
                <strong>Avatar in circle</strong> — you in a corner circle, speaking the script
                exactly as written, over scenes made for each sentence. Attach a few photos and
                each takes a sentence among the scenes; attach many and the photos are the background.
                Up to 12 of your photos move gently, a slow drift made from the photo itself and checked
                to stay true to it; the description then says &ldquo;Photos animated with AI.&rdquo; On a
                listing video, <strong>Open with me in front of the home</strong> starts it with a 6-second
                shot of you at the front of the listing, made with AI from your look and its front photo:
                choose <strong>Full body</strong>, <strong>Chest up</strong> or <strong>Off</strong>. The last 5
                seconds show your contact card beside your circle: your logo, name, company, phone and website,
                from your profile.
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
                <strong>2 to 10 minutes</strong>, an avatar video in about <strong>10 to 12</strong>, and a
                long one can take up to an hour. You can close the page: when it&apos;s done, Sparklee pops
                up on whatever page you&apos;re on with <strong>Watch</strong> and{" "}
                <strong>Edit thumbnail</strong>, and if you&apos;ve left the app you get a{" "}
                <strong>Your video is ready</strong> email instead.
              </span>
              <span className="block mt-1.5">
                Above the button, <strong>Ready to make</strong> checks your voice, that your look fits the
                video&apos;s shape, your Digital Twin approval and your videos left. Anything not ready has a
                button that fixes it (<strong>Approve now</strong>, <strong>Use the wide one</strong>,{" "}
                <strong>Get more</strong>), and Spark Video stays off until it&apos;s all green, so nothing is
                charged for a video that can&apos;t be made. The look that fits the shape is picked for you;{" "}
                <strong>Change look</strong> shows them all. If a video fails, your allowance is refunded automatically. When lots of
                videos are being made at once, yours waits <strong>in line</strong> and starts on its
                own a few minutes later; nothing is charged until it starts.
              </span>
            </Step>
            {/* Its own step: the owner wants it found, and it was the last
                paragraph of the listings step. */}
            {/* Weekly Autopilot, paid plans (2026-10-21, the owner's wording). */}
            <Step n={16} title="AutoSparks, Halo Sites And Email Drafts (Paid Plans)" icon={Sparkles}>
              Every Sunday evening, SparkReels writes 3 posts for your week about your market, the
              season, and what buyers are asking AI: 1 video and 2 blog posts to start, or pick your
              own mix at the top of the AutoSparks page (2 videos and 1 blog, 3 videos, or 3 blogs).
              Each video you approve uses one of your plan&apos;s videos for the month; the top of the
              page shows how many you have left.
              Every video also comes with its own blog article. Each comes with
              its script, blog post, title and description, set for Tuesday, Thursday and Saturday
              at 9 AM, or the 3 days and time you pick under <strong>Post on</strong>. On Monday morning you get an email: &ldquo;Your week is ready.&rdquo; Open{" "}
              <strong>AutoSparks</strong> in the menu and, on each one, press{" "}
              <strong>Approve</strong> to open it ready to make, <strong>Change</strong> to edit it
              first, or <strong>Skip</strong>. On a video, <strong>Record it myself</strong> opens the
              camera with the script in the teleprompter, free. Want something specific? Use{" "}
              <strong>Ask for ideas</strong>: type or say a topic, and up to 3 drafts are written in
              about a minute. Nothing is made, posted or charged until you approve it, and you can
              turn AutoSparks off at the top of that page.
              {/* Halo sites, promo videos and email drafts (2026-10-24, the owner's ask). */}
              <span className="block mt-3 scroll-mt-20 font-semibold text-brand-text" id="halo-sites">Halo sites</span>
              <span className="block mt-1">
                If you have a Halo website, add it in{" "}
                <Link href="/settings/crm#halo" className="text-primary-600 font-medium hover:underline">Settings → 10 · CRM → Halo website</Link>,
                under CRM Integration: press <strong>Add your Halo site</strong>, type the address,
                like <em>springfieldhomes.com</em>, and press <strong>Add</strong>. You can add more than
                one. Its drafts show up on the AutoSparks page. No Halo website yet? The same card has{" "}
                <strong>Get Halo</strong>, which opens Halo&apos;s sign-up ($99 a month, billed by Halo). Every morning SparkReels looks for
                what is new on them: new blog posts and guides, and your market report and events
                page when they change. Pages already on your site when you add it are left alone, so
                adding a site never turns your old posts into videos.
              </span>
              <span className="block mt-1.5">
                Choose which pages to make videos from under <strong>Videos from</strong> (Blog,
                Guides, Events, Market report and more), how many a month under{" "}
                <strong>Each month</strong> (1 to 4, one a week), and the day and time under{" "}
                <strong>Post on</strong>. The rest are the starting choices for every Halo video:{" "}
                <strong>Look</strong> (Avatar in circle, Avatar video, or <strong>Mix</strong>, which
                uses Avatar video for the market report and Avatar in circle for the rest),{" "}
                <strong>Avatar</strong>, <strong>Size</strong>, <strong>Post to</strong> (the accounts
                you connected), <strong>Captions</strong> and <strong>Music</strong>. When your sites
                publish more than your month holds, the others wait under{" "}
                <strong>Also new on your sites</strong>, and <strong>Use instead</strong> swaps one in.
              </span>
              <span className="block mt-1.5">
                Each Halo draft shows up under <strong>From your Halo sites</strong> with its thumbnail
                and setup at a glance, and a link to the post it came from. The script is written from
                the post itself. The thumbnail uses the post&apos;s photo, or an AI picture of the town
                when there isn&apos;t one, with your headshot on top. Press <strong>Setup</strong> to
                change anything for that one video: the picture (from the post, an AI picture, or{" "}
                <strong>Upload</strong> your own), look, avatar, size, what is on screen (stock clips of
                the area or the post&apos;s own photos), captions, music, accounts and when it posts.{" "}
                <strong>Edit script</strong> opens it in the editor.
              </span>
              {/* The owner's ask (2026-10-24), after Daniel Okiro made a Halo
                  draft's video twice: how to change a draft and get one video. */}
              <span className="block mt-1.5 font-semibold text-brand-text">Changing a draft without making two videos</span>
              <span className="block mt-1">
                Nothing is made until you press <strong>Make video</strong>, so change as much as you like first.
              </span>
              <ul className="list-disc pl-5 mt-1 space-y-1">
                <li>
                  <strong>The look, size, avatar, captions, music, picture, accounts or day:</strong> press{" "}
                  <strong>Setup</strong> on the card. Changing these makes nothing.
                </li>
                <li>
                  <strong>The words:</strong> press <strong>Edit script</strong>, change the script, then press{" "}
                  <strong>Save Draft</strong> next to the video settings. Don&apos;t press{" "}
                  <strong>Spark Video</strong> there. Go back to AutoSparks; the card shows your new words.
                </li>
                <li>
                  When you&apos;re happy, press <strong>Make video</strong> on the card. It uses the card&apos;s{" "}
                  <strong>Setup</strong> choices, not the editor&apos;s video settings, so change the look and
                  size in Setup and only the words in the editor.
                </li>
                <li>
                  Pressed <strong>Spark Video</strong> in the editor by mistake? That&apos;s fine: the card
                  then says <strong>Video made</strong> and shows <strong>Watch</strong> and{" "}
                  <strong>Approve to post</strong> for that video, using nothing more. A draft never makes a
                  second video.
                </li>
              </ul>
              {/* Two steps since 2026-10-26 (the owner's ask): make and watch,
                  then approve. And never post an approved one by hand. */}
              <span className="block mt-1.5 font-semibold text-brand-text">Make it, watch it, then approve it</span>
              <ol className="list-decimal pl-5 mt-1 space-y-1">
                <li>
                  <strong>Make video</strong> makes the video and uses one video from your plan. Nothing posts
                  yet. The card says <strong>Making your video</strong> until it&apos;s done.
                </li>
                <li>
                  When it&apos;s done, the card shows <strong>Watch</strong>. Watch it first. Below it you can change{" "}
                  <strong>Posts on</strong> (the day and time), press <strong>Edit thumbnail</strong> (background,
                  words, font, size, style and colour, the same editor as in Publish), and press{" "}
                  <strong>Edit title and caption</strong> to change the YouTube title and description and the caption
                  for the other accounts, then <strong>Save words</strong>. What you save there is exactly what posts.
                </li>
                <li>
                  <strong>Approve to post</strong> sets it to post by itself on the card&apos;s day and time, to
                  the accounts you chose, and each caption links back to your Halo post.
                </li>
              </ol>
              {/* Seller Updates on AutoSparks (2026-10-26, the owner's mockup). */}
              <span className="block mt-1.5 scroll-mt-20" id="seller-updates">
                <strong>Seller updates</strong> (on AutoSparks, paid plans) send your weekly seller update by
                itself. In the <strong>Seller updates</strong> box, turn it <strong>On</strong> and pick the
                day and time, the video (<strong>Avatar in circle</strong> or <strong>Email only</strong>) and
                whether the sellers also get a text. Every listing with its sellers added from BoldTrail gets a
                card for that day (a listing without them shows <strong>Add sellers</strong>). On the card, type
                the week&apos;s numbers (last week&apos;s show in grey; all optional) and what buyers said, then
                press <strong>Write it &amp; make video</strong>, <strong>Email only</strong>,{" "}
                <strong>Record it myself · unlimited</strong> or <strong>Skip this week</strong>. When the video
                is done (about 5 to 10 minutes), <strong>Watch</strong> it, <strong>Preview email</strong>,
                and press <strong>Approve to send</strong>: it emails each seller through BoldTrail on its day,
                video included. <strong>Don&apos;t send it yourself</strong> from Spark Tools, or they get it
                twice. The Avatar in circle video uses 1 short video per listing each week; Email only uses
                none, and recording it yourself on camera is unlimited.
              </span>
              <span className="block mt-1.5">
                <strong>Don&apos;t post an approved video yourself</strong> from My Sparks or the Publish window.
                It posts by itself, so posting it by hand puts it up twice. The Publish window warns you when a
                video is set to post by itself. Already posted it yourself? Press <strong>Skip</strong> on the
                card instead of approving it.
              </span>
              <span className="block mt-1.5">
                After approving, you can still change <strong>Posts on</strong> until it&apos;s handed to your
                accounts. <strong>When to text Halo:</strong> after the video is published on your channel on its
                day and time, not before, because until then the link doesn&apos;t play. Then the card shows{" "}
                <strong>Put on my Halo post</strong> (it is on every Halo card, also for a video you posted
                yourself: paste its YouTube link in the box if it isn&apos;t filled in): it writes the message for
                you, and on your phone <strong>Text Halo</strong> opens your messages with it filled in, so Halo
                can add the video to the post. To put a video you posted yourself on your Halo post, text Halo at
                (415) 726-3224: &ldquo;Halo, add this video to the top of my post [your post&apos;s link]: [your
                YouTube link]&rdquo;. <strong>Skip</strong> sets a draft aside and its day is filled with the
                next new post.
              </span>
              {/* On your Halo post, and folding finished cards (2026-10-26). */}
              <span className="block mt-1.5">
                Once Halo has added it, the card says <strong>✓ On your Halo post</strong> and stops asking you to
                text Halo. SparkReels looks at your Halo post for the video each morning and when you open
                AutoSparks; if it hasn&apos;t noticed yet, press <strong>It&apos;s on my post</strong> (and{" "}
                <strong>Not yet</strong> undoes it). Finished cards (posted, and on your Halo post) fold into a{" "}
                <strong>Done</strong> line once newer cards arrive; <strong>Show</strong> opens them again.
              </span>
              <span className="block mt-3 font-semibold text-brand-text">Promo video for your Halo referral page</span>
              <span className="block mt-1">
                Add your Halo referral page too. It is marked <strong>Affiliate</strong> and has a{" "}
                <strong>Make promo video</strong> button. Pick an angle (<strong>Why I use Halo</strong>,{" "}
                <strong>Free authority page</strong> or <strong>Halo Pro</strong>) and press{" "}
                <strong>Write it</strong>. The script uses your referral code, and the video says out
                loud that you earn a referral fee when someone joins with it. The caption carries{" "}
                <strong>#ad</strong> for the same reason, as the law requires for paid referrals. It is
                set to post to Facebook, LinkedIn and Instagram, where other agents will see it.{" "}
                <strong>New script</strong> writes a fresh one. Promo videos are made when you ask, and
                are not one of your Halo videos for the month.
              </span>
              <span className="block mt-3 font-semibold text-brand-text">Email drafts</span>
              <span className="block mt-1">
                Every email you forward to your import address (step 6) also becomes a video draft in
                the same list, marked <strong>Email</strong>, about a minute after it arrives. It is set
                for the next free day at your Halo time and is not one of your Halo videos for the
                month. The script is written fresh from the email, so a market report from a data
                provider is never posted word for word. The email&apos;s photos are used for the
                thumbnail and, if you choose, on screen. <strong>Setup</strong>,{" "}
                <strong>Make video</strong> and <strong>Approve to post</strong> work the same as on a Halo draft. Up to 5 email drafts are
                written a day. Turn it off with the <strong>Forwarded emails</strong> switch in the Halo
                sites box; your emails still arrive in Spark Studio either way.
              </span>
            </Step>
            <Step n={17} title="Voice Over Only — The Scenes Reel" icon={Sparkles}>
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
                its own photos (step 19). A Scenes Reel uses <strong>one short video</strong>, and{" "}
                <strong>&ldquo;Scenes made with AI.&rdquo;</strong> is added to its description.
              </span>
            </Step>
            <Step n={18} title="Camera/Teleprompter — The Free Option" icon={Camera}>
              Pressing <strong>Camera/Teleprompter</strong> opens a page of its own, with{" "}
              <strong>Back</strong> on the bar at the bottom to return to Spark Studio. The mic box at
              the top holds what it&apos;s about; anything you already said or typed on Spark Studio
              comes with you. Then pick where the script comes from: <strong>AI writes it</strong>,{" "}
              <strong>From a document</strong> (a PDF, link or email), <strong>From a voice memo</strong>{" "}
              (a recording of you talking, turned into a clean script), <strong>Paste my own script</strong>{" "}
              (word for word), or <strong>No script</strong> (no teleprompter at all).{" "}
              <strong>Details</strong> are your market and, when AI or a document writes it, how long:{" "}
              <strong>up to 3</strong>, <strong>8</strong> or <strong>15 minutes</strong>;{" "}
              <strong>More options</strong> holds audience, tone and why. <strong>Write my script</strong>{" "}
              in the bar at the bottom writes it, and <strong>Set up your take</strong> appears: your
              teleprompter, <strong>Behind you</strong>, vertical or horizontal, Branded Look, and{" "}
              <strong>Add Channel CTA</strong> to append your closing pitch. You can also skip straight here with <strong>Record on Camera</strong>, a
              one-click button on any script or blog post. The <strong>teleprompter scrolls automatically</strong>{" "}
              while you record in up to 1080p/60fps, for up to <strong>15 minutes</strong> (8–15 min is
              YouTube&apos;s algorithm sweet spot and unlocks mid-roll ads).
              <span data-paid-only="true">
              On paid plans, on a computer, press <strong>Record my screen</strong> under the script choices to record a listing, a market
              report or anything else on screen while you talk, with you in a corner circle or not.
              It records horizontal, up to 10 minutes, and finishes like any camera recording.
              </span>
              {/* The teleprompter's reading and speed controls (2026-10-21). */}
              <span className="block mt-1.5">
                <strong>Read your script first</strong> in the script box, or press{" "}
                <strong>Read it full screen</strong> to see the whole script in large type and edit it
                there; <strong>Done</strong> takes you back. Under it, <strong>Flow</strong> follows your
                voice and keeps the line you&apos;re reading near the top, with the next lines below it.{" "}
                <strong>Auto</strong> scrolls at a steady speed you pick: <strong>Slow</strong>,{" "}
                <strong>Medium</strong> or <strong>Fast</strong>. While you record in Auto, tap{" "}
                <strong>−</strong> or <strong>+</strong> under the teleprompter to slow it down or speed it
                up without stopping. If Flow feels behind you, switch to Auto.
              </span>
              {/* Three things can be behind the speaker now, and one of them
                  costs something, on a screen whose headline is "free". */}
              <span className="block mt-1.5">
                <strong>Behind you</strong>, in Set up your take, is what fills the screen while you talk
                in the corner: <strong>Just me</strong> (you, full screen), <strong>Your photos</strong>{" "}
                (up to 20), <strong>Your own footage</strong>, a video you shot that plays behind you
                (silent, and it loops), or{" "}
                <strong>AI scenes</strong>: short realistic scenes made with AI,
                one for each part of what you&apos;re about to say, in order. People appear only from
                behind or at a distance, and it is never your town or a real property. Scenes take
                about three minutes to make and use{" "}
                <strong>one short video</strong> from your plan; photos and your own footage stay
                free. Write the script first, because the scenes are made from it. Choosing a clip or
                scenes turns on Branded Look, which draws the background.
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
                <strong>Post a video you already shot</strong> — on a computer, open{" "}
                <strong>Camera/Teleprompter</strong> in Spark Studio and press{" "}
                <strong>Post a video as is</strong> under the script choices, then{" "}
                <strong>Choose a clip you already shot</strong> and pick a video from your computer: MP4,
                MOV or WebM, up to 2 minutes and 500 MB. Keep the clip&apos;s own sound or record a new
                voiceover, add a title, a hook and the city, then press <strong>Brand this clip</strong>.
                Your logo is added, captions are written from what&apos;s said, and the finished video is
                saved to <strong>My Sparks</strong>, ready to publish. It counts as a camera recording,
                not one of your plan&apos;s videos. This is on computers only; phones can&apos;t do the
                branding yet.
              </span>
              {/* Delete on the finished take (2026-10-22). */}
              <span className="block mt-1.5">
                <strong>Don&apos;t want a take?</strong> Once it&apos;s saved, press{" "}
                <strong>Delete</strong> beside <strong>Re-record</strong>. It&apos;s removed from My
                Sparks, with its Share Kit, and you&apos;re back at the camera with your script ready.
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
            <Step n={19} title="Listings And Photos Only Reels" icon={ImageIcon}>
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
                <strong>Open with me in front of the home</strong> (either kind, vertical or horizontal):
                your first photo becomes a 6-second shot of you at the front of the home, made with AI
                from your look. Choose <strong>Full body</strong>, <strong>Chest up</strong> or{" "}
                <strong>Off</strong>. It uses your Digital Twin once approved, otherwise your headshot.
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
                No photos to start from? That is a Scenes Reel (step 17).
              </span>
            </Step>
            <Step n={20} title="Your Share Kit — And A Blog Post" icon={FileText}>
              Every video finishes on its <strong>Share Kit</strong>: the title, description and hashtags
              Publish fills in for you, plus an Instagram caption, a LinkedIn post and an email blurb. It also
              holds a <strong>blog article</strong> — usually 1,000 to 1,500 words, titled with the question a
              reader would actually type, headings written the same way and answered in the first line,
              and a <strong>Frequently Asked Questions</strong> section of six questions at the end, chosen
              from what people are asking about that subject in your town. Those six are{" "}
              <strong>AI answer blocks</strong>, built into every article (step 25). That is the shape an AI
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
            <Step n={21} title="Publish To YouTube — One Click" icon={MonitorPlay}>
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
            <Step n={22} title="Everywhere Else — From The Same Window" icon={Upload} anchor="auto-publish">
              The <strong>Publish</strong> window lists every account you connected in step 9. Tick the
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
                needs connecting again in Settings; the note then has a <strong>Reconnect</strong> button.
              </span>
              {/* Sparklee's notes (2026-10-26). */}
              <span className="block mt-1.5">
                Sparklee leaves short notes at the top of My Sparks too. <strong>Fixed for you</strong> says
                what went wrong and that she already fixed it, for example a missing avatar look swapped for
                another of yours, with nothing extra charged. <strong>Needs you</strong> is something only you
                can do, with the button for it. Dismiss either one with the ✕.
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
              <span className="block mt-1.5 scroll-mt-20" id="email-it">
                <strong>Email it.</strong> Any finished video in My Sparks can be emailed. Press{" "}
                <strong>Email it</strong> and add up to 10 people: search your BoldTrail by name or email
                (people you&apos;ve sent a video to before, and your sellers, are one tap), or{" "}
                <strong>Add someone new</strong> with their name and email. Someone new is only saved to
                your BoldTrail if you tick <strong>Also add them to my BoldTrail</strong>. Without
                BoldTrail, type their first name and email. SparkReels writes a short subject and note
                that you can change or say out loud. Put <strong>{"{first name}"}</strong> in the note and
                each person sees their own name (a couple typed as &ldquo;Jane and Tom&rdquo; gets
                &ldquo;Hi Jane and Tom&rdquo;). The email shows your video&apos;s thumbnail, the one you
                edited, with a play button and a <strong>Watch the video</strong> button; email can&apos;t
                play a video inside the message, so a tap opens it. <strong>Send email</strong> asks you to
                confirm; tick <strong>Send me a copy</strong> to get one yourself, showing who it went to.
                BoldTrail contacts get it from your BoldTrail address; everyone else gets it from
                &ldquo;your name via SparkReels&rdquo;, with replies going to your own email (up to 30 a
                day). For your whole list, use your email tool or BoldTrail&apos;s own campaigns, which
                handle unsubscribes.
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
            <Step n={23} title="The Everyday Tools" icon={Wand2} anchor="record-my-screen">
              <Link href="/tools" className="text-primary-600 font-medium hover:underline">Spark Tools</Link> is in four
              groups: <strong>For a video</strong> (Thumbnail, Title, Description, Tags, Script, Record My Screen),{" "}
              <strong>Images &amp; banners</strong> (AI images, banners, Channel Name, LinkedIn Profile),{" "}
              <strong>Reviews</strong> (Google Reviews, Ask for Google Review Video Email) and <strong>Sellers &amp; AI search</strong> (Seller Update,
              AI Answer Blocks). Pick a group, then a tool.{" "}
              <strong>Record My Screen</strong> is the simple screen recorder: tick or untick{" "}
              <strong>Show me in a corner circle</strong>, press <strong>Start recording</strong>, pick the tab or window
              to show, talk as you go, and press Stop. Up to 10 minutes, free, saved to My Sparks with Watch,
              Download, Publish and Email it. Showing a web page? Open it in another tab first and pick that tab:
              the tab you record from is never offered, so the recording can't show itself.{" "}
              You don&apos;t need Spark Tools to
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
                (step 9). <strong>Needs a reply</strong> is ticked to begin with, so you see only
                the ones you haven&apos;t answered; untick it to see them all. On any review,{" "}
                <strong>Draft a reply</strong> writes a short one in your voice for you to edit, or{" "}
                <strong>Write my own</strong> gives you an empty box. Nothing goes to Google until
                you press <strong>Post reply</strong>. A reply you&apos;ve already posted can be
                edited or removed. Read a drafted reply to a low rating with extra care before
                posting it. <strong>Ask for more reviews</strong> at the top opens the next tool.
              </span>
              {/* Ask for Google Review Video Email (2026-10-27). */}
              <span className="block mt-1.5 scroll-mt-20" id="google-review-video">
                <strong>Ask for Google Review Video Email</strong> sends past clients a short video asking for a
                review, with a big gold <strong>Leave me a Google review</strong> button under it. First save your
                link in Settings under <strong>Your Google review link</strong> (in your Google Business Profile:{" "}
                <strong>Ask for reviews</strong> → <strong>Copy link</strong>). Then, in four steps:{" "}
                <strong>1 Who</strong>: up to 10 people, picked from BoldTrail by name or email, or typed in by
                first name and email. <strong>2 Your video</strong>: edit the words, then{" "}
                <strong>Record it myself</strong> (free, unlimited: the camera opens with the words on the
                teleprompter, and when it&apos;s saved, come back and it&apos;s picked for you),{" "}
                <strong>Avatar in circle</strong> (up to 60 seconds, uses 1 short video),{" "}
                <strong>Photo reel</strong> (upload your photos; the words show as text cards or your cloned voice
                reads them; free) or <strong>Use a video I made</strong>. Make one general video once, with no
                client names, and press <strong>Save as my review video</strong>: from then on it&apos;s picked for
                you every time and never made again, so it uses nothing more from your plan.{" "}
                <strong>Save as my default</strong> under the words keeps your words and subject; they fill in
                every time, and you can also change them in Settings under your review link.{" "}
                <strong>3 The email</strong>: the
                subject and note; {"{first name}"} becomes each person&apos;s first name.{" "}
                <strong>4 Send email</strong>: BoldTrail contacts get it from your BoldTrail address. Someone
                new is saved to BoldTrail only if you tick <strong>Also add them to my BoldTrail</strong>;
                otherwise, and without BoldTrail, it comes from &ldquo;your name via SparkReels&rdquo; and replies
                go to your own email. That can land in Promotions or spam more often, so use{" "}
                <strong>Send me a test</strong> first. Tick <strong>Send me a copy</strong> when you send to get
                one yourself. The email shows your video&apos;s thumbnail with a play button.
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
                button.
              </span>
              {/* How to send it, said plainly (2026-10-26, the owner's ask: she
                  couldn't find the send button). */}
              <span className="block mt-1.5 font-semibold text-brand-text">How to send a Seller Update</span>
              <ul className="list-disc pl-5 mt-1 space-y-1">
                <li>
                  <strong>Through BoldTrail:</strong> in the orange <strong>Sellers in BoldTrail</strong> box,
                  start typing the seller&apos;s name or email and pick them from the list that drops down
                  (or type the email exactly as it is in BoldTrail and press <strong>Add</strong>).
                  Their name shows as a chip (up to 4, once per listing). Only then does the orange{" "}
                  <strong>Send to sellers through BoldTrail</strong> button appear, next to{" "}
                  <strong>Copy as HTML</strong>. Press it and confirm; it emails each seller the update,
                  video included, with an optional short text to say it&apos;s on its way. The update
                  then shows when it was sent and to whom. The seller has to be a contact in BoldTrail
                  already, and BoldTrail has to be connected in Settings.
                </li>
                <li>
                  <strong>Every week by itself:</strong> turn on <strong>Seller updates</strong> on AutoSparks
                  (step 16). You add the numbers, watch the video and approve; it sends on its day.
                </li>
                <li>
                  <strong>From your own email:</strong> press <strong>Copy as HTML</strong>, paste it into
                  a new email and send it. <strong>Copy as text</strong> is for a plain email or a text
                  message.
                </li>
                <li>
                  <strong>Send me a test</strong> sends it to you first, so you see what your sellers will
                  see.
                </li>
                <li>
                  The video in the preview on the right shows in a tall black box. That is only this
                  screen&apos;s preview: in the email it is a small picture your sellers tap to watch.
                </li>
              </ul>
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
            <Step n={24} title="Graphics Without A Designer" icon={ImageIcon}>
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
              {/* The Video Business Card (2026-10-30). */}
              <span className="block mt-1.5 scroll-mt-20" id="video-business-card">
                <strong>Video Business Card</strong> (paid plans; Spark Tools → <strong>Images &amp; banners</strong>) is two
                things that work together. Your <strong>card page</strong> at sparkreels.ai/card/your-name shows
                your <strong>Agent Intro</strong> (or a video you pick), your name, brokerage and logo, round{" "}
                <strong>Call</strong>, <strong>Text</strong>, <strong>Email</strong> and <strong>Website</strong>{" "}
                buttons, <strong>Book a call</strong>, <strong>Save my contact</strong> (adds you to their phone)
                and, if you switch them on, your home value page, Google reviews and YouTube channel. Your name,
                phone, email, website and logo come from Settings; add a title, booking link and home value page,
                pick a colour, and press <strong>Save card</strong>. Your <strong>video card</strong> is your video
                with your name strip sliding in at the start and a five-second end card with your photo, phone,
                email, website and a QR code to your card page. Press <strong>Make my video card</strong>; it takes
                about a minute and uses nothing from your plan. Then <strong>Download MP4</strong> or{" "}
                <strong>Text it</strong>, and post it as a story or on LinkedIn. To share the card page, use{" "}
                <strong>Copy</strong>, <strong>Text it</strong>, <strong>Email it</strong>,{" "}
                <strong>Download QR code</strong> for print, or <strong>Copy email signature</strong>. The link and
                QR code never change. On a paid plan you also see how many opened it, watched, tapped and saved
                your contact in the last 30 days. No Agent Intro yet? <strong>Make my Agent Intro</strong> opens it
                in Spark Studio.
              </span>
            </Step>
            <Step n={25} title="AI Answer Blocks — Get Cited By AI Search" icon={Bot}>
              Buyers ask ChatGPT and Perplexity things like &ldquo;which neighborhood should I buy in?&rdquo;
              months before they call an agent. On <strong>Create</strong>, under the topic box,{" "}
              <strong>What buyers ask AI</strong> shows a question buyers in your city are asking right
              now, using the city in Settings unless you type another in Details.{" "}
              <strong>Show more</strong> opens the rest, and <strong>Record this</strong> makes one your
              topic, so the video answers it.
              <span className="block mt-1.5">
                <strong>Every blog article already has answer blocks.</strong> The six questions at the end
                of each article in your Share Kit (step 20) are written the way AI assistants quote, for
                that article&apos;s topic, so there is nothing extra to make.
              </span>
              <span className="block mt-1.5">
                The full tool is in <strong>Spark Tools</strong>, under <strong>Sellers &amp; AI search</strong>. For each question it also
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
            <Step n={26} title="What A Spark Is" icon={Sparkles}>
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
            <Step n={27} title="Spark Insights — What You Have And How It Did" icon={BarChart2}>
              <Link href="/analytics" className="text-primary-600 font-medium hover:underline">Spark Insights</Link>{" "}
              is what happened; <strong>Home</strong> is what needs you. What you have left, the{" "}
              <strong>Getting Started</strong> checklist and your latest work are on Home now.
              <span className="block mt-1.5">
              Insights looks backwards: how many videos you&apos;ve made and published, a
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
            <Step n={28} title="Spark Calendar — When It Goes Out" icon={CalendarDays}>
              The calendar puts every dated item — published or scheduled — on a month, week or list
              view, with the <strong>All Sparks</strong> panel beside it for everything that has no
              date yet. Open any Spark from either side to reach its card. This one is still rolling
              out: it appears in your menu when your account has it.
            </Step>
            {/* The affiliate program (2026-10-17), worded as the owner approved. */}
            <Step n={29} title="Earn With The Affiliate Program" icon={DollarSign}>
              Recommend SparkReels and earn <strong>20% of what each customer you refer pays, every
              month for their first 12 months</strong>. The SparkReels Affiliate Program is available
              to active paid subscribers. Open <strong>Affiliate</strong> in the menu and
              press <strong>Apply to join</strong>, or sign in and use <strong>Affiliates</strong> at the
              bottom of the website, and tell us a little about how you&apos;d share SparkReels.
              If your plan ends, your affiliate account is paused: earnings you already have are kept
              and paid when you subscribe again, but payments your referrals make while you&apos;re
              paused don&apos;t earn a commission. When you&apos;re
              approved, you&apos;ll get an email titled{" "}
              <strong>&ldquo;You&apos;re approved — welcome to the SparkReels affiliate program&rdquo;</strong>{" "}
              with your referral code, your referral link and two steps. First, open the link in it
              while signed in, to connect the program to your account. Then, on the{" "}
              <strong>Affiliate</strong> page, connect your bank with Stripe to get paid. Payouts are
              sent monthly. If the email hasn&apos;t arrived, look in spam.
              {/* The owner's ask (2026-10-24). */}
              <span className="block mt-1.5">
                <strong>Also a Halo affiliate?</strong> On the <strong>Affiliate</strong> page, put your Halo
                page (like <em>halo-your-name.huzi.site</em>) or your Halo code in{" "}
                <strong>Your Halo affiliate link</strong> and press <strong>Save</strong>. Agents you refer to
                SparkReels then get your link on their <strong>Get Halo</strong> button. With only a code,
                the button texts &ldquo;CODE PRO&rdquo; to Halo instead. Under it,{" "}
                <strong>Pressed Get Halo</strong> lists each agent who pressed it, with their name, email and
                date, so you can find them on your Halo dashboard and see who signed up.
              </span>
            </Step>
          </div>
          <VideoPlaceholder label="Finding Your Work" />
        </Card>

        {/* ── Quick reference ── */}
        <Card padding="sm" className="bg-gradient-to-br from-slate-50 to-white">
          <h2 className="text-base font-bold text-brand-text mb-3">The Weekly Rhythm</h2>
          <ol className="text-sm text-slate-600 leading-relaxed space-y-1.5 list-decimal pl-5">
            <li><strong>Once:</strong> set up your profile, voice, avatar, CTA, YouTube and your email import address (Part 1)</li>
            <li><strong>Any time:</strong> on Home, tell Sparklee what you want, check her plan and approve it — then approve each video before it posts</li>
            <li><strong>Weekly:</strong> hit the mic and say it, tap a topic chip, or forward a report → generate script → Spark Video — about 5 minutes of your time</li>
            <li><strong>Hands off:</strong> add your Halo site on AutoSparks, or forward an email, and approve the drafts that show up there — they make and post themselves</li>
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
  );
}
