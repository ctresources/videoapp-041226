-- The SparkReels blog at sparkreels.ai/blog (2026-10-22, the owner's ask).
-- The owner writes posts in SparkReels as usual; an admin-only "Publish to
-- SparkReels blog" button in the Share Kit copies the article here. The
-- public pages read published rows; only the server (service role) writes.
CREATE TABLE IF NOT EXISTS public.blog_posts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title        TEXT NOT NULL,
  -- Meta description and the teaser on the blog home.
  description  TEXT,
  topic        TEXT,
  cover_url    TEXT,
  -- The article as HTML, built by lib/utils/blog-html.ts (escaped there).
  body_html    TEXT NOT NULL,
  -- Its questions and answers, for the FAQ schema.
  faqs         JSONB NOT NULL DEFAULT '[]'::jsonb,
  author_name  TEXT,
  word_count   INTEGER NOT NULL DEFAULT 0,
  project_id   UUID UNIQUE REFERENCES public.projects(id) ON DELETE SET NULL,
  published    BOOLEAN NOT NULL DEFAULT TRUE,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published ON public.blog_posts (published, published_at DESC);

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Published posts are public" ON public.blog_posts
  FOR SELECT TO anon, authenticated USING (published);

-- Supabase stops granting new tables automatically from 2026-10-30.
GRANT SELECT ON public.blog_posts TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blog_posts TO service_role;
