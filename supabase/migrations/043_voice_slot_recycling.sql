-- 043: keep the voice sample so the clone itself can be temporary
--
-- Voice clone slots are an account-wide allowance from the render service's
-- plan — 2 on free, 40 on the next tier — not something bought per user. A
-- clone that sits in a slot between a free video and a subscription that may
-- never come is the most expensive thing on that allowance: it holds capacity
-- for an account doing nothing with it.
--
-- So the clone becomes disposable and the SAMPLE becomes the durable thing.
-- The recording is kept here, the clone is retired once it has done its job,
-- and it is rebuilt from the sample the moment a render needs it again. The
-- agent never records twice and never learns any of this happened.
--
-- The sample is a person's voice, which is biometric data: it is deleted with
-- the account, and the Settings card says it is being kept and why.

ALTER TABLE public.profiles
  -- Private object in the voice-recordings bucket. Never public: a voice
  -- sample is the one upload that could be used to impersonate its owner.
  ADD COLUMN IF NOT EXISTS voice_sample_url TEXT,
  ADD COLUMN IF NOT EXISTS voice_sample_at TIMESTAMPTZ,
  -- When the clone was last given up. Null while one is live, which is what
  -- the nightly sweep and the restore path both read.
  ADD COLUMN IF NOT EXISTS voice_clone_retired_at TIMESTAMPTZ;

-- The sweep asks one question — "free accounts holding a clone, last active
-- when?" — and this is the half of it the planner can use.
CREATE INDEX IF NOT EXISTS idx_profiles_voice_sample
  ON public.profiles(voice_sample_at)
  WHERE voice_sample_url IS NOT NULL;
