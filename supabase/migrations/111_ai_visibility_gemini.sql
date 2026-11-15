-- AI Visibility: Gemini (with Google Search) as a third engine, 2026-11-15.
alter table public.ai_visibility_checks drop constraint if exists ai_visibility_checks_engine_check;
alter table public.ai_visibility_checks
  add constraint ai_visibility_checks_engine_check check (engine in ('chatgpt', 'perplexity', 'gemini'));
