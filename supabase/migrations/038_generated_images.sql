-- 038: images made in the Spark Tools image generator
--
-- One row per finished image. The row is what the monthly limit counts, so the
-- limit needs no Stripe webhook changes and no reset job: "this month" is a
-- WHERE clause on created_at, not a balance someone has to remember to refill.
--
-- ai_background marks the images that cost money to make. An image rendered
-- over the agent's own listing photo, or re-rendered with new text over a
-- background it already had, is free and is not counted.
--
-- Written only by the service role (/api/tools/image). Users can read their
-- own rows, which is all the allowance count on the client side needs.

CREATE TABLE IF NOT EXISTS public.generated_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  template TEXT NOT NULL,
  shape TEXT NOT NULL,
  image_url TEXT NOT NULL,
  background_url TEXT,
  ai_background BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generated_images_user_created
  ON public.generated_images(user_id, created_at DESC);

ALTER TABLE public.generated_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own generated images" ON public.generated_images
  FOR SELECT USING (auth.uid() = user_id);
