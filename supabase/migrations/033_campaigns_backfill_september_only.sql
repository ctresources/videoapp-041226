-- Campaigns start from September 2026.
--
-- 032_campaigns_above_projects filed every existing project into its own
-- campaign. The owner asked for September onward only, so campaigns for
-- projects created before 2026-09-01 (US Eastern) are removed. The projects
-- themselves are untouched apart from losing the link: deleting a campaign
-- nulls projects.campaign_id and social_posts.campaign_id through their
-- ON DELETE SET NULL foreign keys.
--
-- The projects updated_at trigger is paused again so unfiling is not recorded
-- as an edit.
--
-- Applied to production 2026-09-11 as migration "campaigns_backfill_september_only".
ALTER TABLE public.projects DISABLE TRIGGER set_projects_updated_at;

DELETE FROM public.campaigns c
USING public.projects p
WHERE p.campaign_id = c.id
  AND p.created_at < timestamptz '2026-09-01 00:00:00-04';

UPDATE public.projects
SET campaign_role = NULL
WHERE campaign_id IS NULL
  AND campaign_role IS NOT NULL;

ALTER TABLE public.projects ENABLE TRIGGER set_projects_updated_at;
