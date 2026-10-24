-- Admin → Emails (2026-10-24, the owner's ask and mockup).
--
-- ghl_workflow_requests: one row each time an agent presses "Ask for the
-- workflow" on the GoHighLevel card (the support email still goes too), or
-- one the owner adds by hand. Sent from Admin keeps a copy of exactly what
-- went out.
--
-- email_replies: the owner's saved replies, written in Admin. The body is
-- plain text: **bold**, "- " bullets, {{first_name}}. The standard sign-off is
-- added when sent if a reply leaves it out.
--
-- Admin only: read and written through /api/admin/emails with the service
-- role. No policies, so signed-in users cannot read either table.

CREATE TABLE IF NOT EXISTS public.ghl_workflow_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  name          TEXT,
  email         TEXT NOT NULL,
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  status        TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'sent')),
  sent_at       TIMESTAMPTZ,
  -- 'sparkreels': sent from Admin. 'marked': the owner replied from her inbox.
  sent_how      TEXT CHECK (sent_how IN ('sparkreels', 'marked')),
  sent_subject  TEXT,
  sent_html     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ghl_requests_requested ON public.ghl_workflow_requests (requested_at DESC);

CREATE TABLE IF NOT EXISTS public.email_replies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- A fixed name for replies the app sends itself ('ghl-workflow'); null for others.
  slug        TEXT UNIQUE,
  name        TEXT NOT NULL,
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ghl_workflow_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_replies ENABLE ROW LEVEL SECURITY;
-- Supabase stops granting new tables automatically from 2026-10-30.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ghl_workflow_requests TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_replies TO service_role;

INSERT INTO public.email_replies (slug, name, subject, body) VALUES (
  'ghl-workflow',
  'GoHighLevel workflow',
  'Your SparkReels → GoHighLevel workflow',
  $body$Hi {{first_name}},

Here's the workflow. It takes about 10 minutes to set up, and after that every video you finish in SparkReels lands in GoHighLevel by itself.

**What it does**
- Texts and/or emails you the new video's title and link the moment it's ready.
- Saves the link as "SparkReels Latest Video", so any email or text you send from GoHighLevel can include your newest video without copying anything.

**1. Create two custom values (GoHighLevel)**
Settings → Custom Values → Add. Make one called **SparkReels Latest Video** and one called **SparkReels Latest Video Title**. Leave them blank.

**2. Start the workflow (GoHighLevel)**
Automation → Workflows → Create Workflow → Start from Scratch. Name it **SparkReels – New Video**. Click Add Trigger and choose **Inbound Webhook**. Copy the webhook URL it shows and keep this tab open.

**3. Connect SparkReels**
In SparkReels go to Settings → CRM integrations → GoHighLevel → **Set up for GoHighLevel**. Paste the URL into Webhook URL, keep **Video published** ticked, and Save. Then press **Test** on it.

**4. Load the sample (GoHighLevel)**
Back in the trigger, click **Test Trigger**, choose the request that came from SparkReels (click Load More if you don't see it), and save the trigger. If GoHighLevel adds a Create/Update Contact step after the trigger, delete that step. This workflow doesn't need a contact.

**5. Add three actions**
- **+ → Update Custom Value.** Custom Value: SparkReels Latest Video. New Value: open the field picker, go to Inbound Webhook Trigger, and choose **video_url**.
- **+ → Update Custom Value.** Custom Value: SparkReels Latest Video Title. New Value: choose **title** the same way.
- **+ → Internal Notification.** Choose SMS and/or Email, send to Particular Users, and pick yourself. Message: "New SparkReels video:" followed by **title** and **video_url** from the field picker.

Save, then switch the workflow from Draft to **Publish**.

**6. Send it to your contacts**
In any email or text you send from GoHighLevel (a campaign to a smart list, a bulk text, or your own nurture workflow), insert the custom values **SparkReels Latest Video** and **SparkReels Latest Video Title**. They always hold your newest video, so a template you save once stays current.

**Good to know**
- Inbound Webhook is a GoHighLevel premium trigger. Each sub-account gets 100 free runs, then your account's premium pricing applies. It runs once per video.
- Treat the webhook link like a password. If it gets out, delete the trigger, add a new one, and paste the new link into SparkReels.
- Make one test video and check that the text arrives before you build emails around it.

Reply here if anything doesn't line up.

The SparkReels Team
support@sparkreels.ai
https://SparkReels.ai$body$
) ON CONFLICT (slug) DO NOTHING;
