-- 037: a Spark is created with its project, not when someone opens the calendar
--
-- fileNewProjects created Sparks on page load using create-then-claim: insert a
-- campaign, then UPDATE projects SET campaign_id ... WHERE campaign_id IS NULL,
-- and delete the campaign again if the claim lost. That prevents duplicate
-- LINKS, but it is not a database guarantee. Two requests can both insert a
-- campaign before either claims, and a process that dies between the insert and
-- the compensating delete leaves an orphan Spark behind for good.
--
-- origin_project_id records which project a Spark was created for. The unique
-- index makes a second concurrent creation for the same project fail with 23505
-- rather than succeed, so the loser reads the winner's row and both requests
-- converge on one Spark with no compensation step to get wrong.
--
-- Deliberately NOT a unique index on blog_project_id, which looks like the same
-- key and is not: /api/campaigns/project lets a Spark with no article of its own
-- adopt a moved video's article, setting blog_project_id on the target before
-- clearing it on the source. Two campaigns hold the same value in between, so a
-- unique index there would make moving a video between Sparks fail outright.

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS origin_project_id UUID
    REFERENCES public.projects(id) ON DELETE SET NULL;

-- Existing rows are deliberately left NULL. There is no backfill.
--
-- An earlier draft of this migration set origin_project_id from blog_project_id
-- wherever projects.campaign_id = campaigns.id. That is wrong in principle:
-- current membership is where a project lives NOW, not where its Spark came
-- from. Once a project has been moved between Sparks the two differ, and the
-- backfill would stamp a false origin — which could then collide with the index
-- below and block recovery for the Spark that genuinely originated there.
-- Provenance is not reconstructable after the fact, so it is not guessed.
--
-- Nothing is lost by leaving them NULL. The index is partial, so NULL rows do
-- not participate, and ensureSparkFor returns at its campaign_id guard for any
-- project already filed — an existing project never reaches the insert, so the
-- constraint is never exercised for it. If a Spark is later deleted, its row
-- goes with it and the project's next recovery pass creates a fresh Spark with
-- a genuine origin.
--
-- (Checked at the time of writing: all 38 campaigns held exactly one project,
-- every blog_project_id was a member of its own campaign, and no project had
-- ever been moved. The backfill would have been correct on this data. It is
-- omitted anyway, because it would be correct by luck rather than by rule.)

CREATE UNIQUE INDEX IF NOT EXISTS idx_campaigns_origin_project
  ON public.campaigns(origin_project_id)
  WHERE origin_project_id IS NOT NULL;
