-- Shared agent layer (2026-11-22, the owner's approved plan, revision 5:
-- docs/plans/mcp-connector-plan.md). One set of tables behind every entry
-- point: MCP clients (ChatGPT, Claude), in-app Sparklee, the eXp Hub later,
-- and HALO / BoldTrail / GHL signals in V1.1.
--
-- Users can read their own rows (Settings -> Connections, history). Only the
-- service role writes: every change goes through lib/agent on the server.

-- Connected AI clients (OAuth grants) and personal access keys.
create table if not exists public.agent_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('oauth', 'key')),
  -- OAuth: the client id from the token. Key: null.
  client_id text,
  -- "ChatGPT", "Claude", or the name the user gave a key.
  client_name text not null,
  scopes text[] not null default '{}',
  -- Keys only: the first characters to show ("sr_pat_ab12…") and a SHA-256
  -- hash of the whole key. The key itself is never stored.
  key_prefix text,
  key_hash text unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz
);
create index if not exists agent_connections_user_idx on public.agent_connections (user_id);
-- One row per OAuth client per user (an upsert target). Keys have no
-- client_id, and nulls never collide, so a user can hold many keys.
create unique index if not exists agent_connections_client_idx
  on public.agent_connections (user_id, client_id);

-- Spark plans from plan_spark. Nothing in a plan runs until it is approved,
-- and approval authorizes creation steps only, never publishing or CRM sends.
create table if not exists public.agent_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  adapter text not null,
  connection_id uuid references public.agent_connections(id) on delete set null,
  goal text,
  signal jsonb,
  steps jsonb not null default '[]'::jsonb,
  totals jsonb not null default '{}'::jsonb,
  summary text,
  upgrade jsonb,
  version int not null default 1,
  plan_hash text not null,
  status text not null default 'proposed'
    check (status in ('proposed', 'approved', 'completed', 'cancelled', 'expired')),
  approved_at timestamptz,
  approval_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agent_plans_user_idx on public.agent_plans (user_id, created_at desc);

-- Every action that can use a credit, create, publish, schedule or send.
-- One row per (user, tool, request_id): a retry finds the row and gets the
-- stored result instead of doing the work twice. `kind` keeps the approval
-- types apart: a publish confirmation can never carry out a CRM send.
create table if not exists public.agent_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid references public.agent_connections(id) on delete set null,
  kind text not null check (kind in ('create', 'publish', 'crm_send')),
  tool text not null,
  request_id text not null,
  payload_hash text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null
    check (status in ('prepared', 'running', 'succeeded', 'failed', 'expired', 'cancelled')),
  result jsonb,
  plan_id uuid references public.agent_plans(id) on delete set null,
  step int,
  expires_at timestamptz,
  -- How a publish or send was confirmed: 'confirm_tool', 'elicitation', 'in_app'.
  confirmed_via text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, tool, request_id)
);
create index if not exists agent_actions_plan_idx on public.agent_actions (plan_id);

-- Audit trail: one row per meaningful agent action.
create table if not exists public.agent_audit_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  adapter text not null,
  connection_id uuid,
  tool text not null,
  request_id text,
  action_id uuid,
  plan_id uuid,
  approval_state text,
  spark_id uuid,
  video_id uuid,
  publish_ref text,
  result text not null check (result in ('ok', 'needs_approval', 'needs_input', 'denied', 'error')),
  error_code text,
  error_message text,
  input_summary text,
  created_at timestamptz not null default now()
);
create index if not exists agent_audit_user_idx on public.agent_audit_log (user_id, created_at desc);

-- Signals from HALO, BoldTrail, GHL and app events (V1.1). Created now so the
-- design has its place; nothing writes here in V1.
create table if not exists public.agent_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  plan_id uuid references public.agent_plans(id) on delete set null,
  created_at timestamptz not null default now(),
  handled_at timestamptz
);

alter table public.agent_connections enable row level security;
alter table public.agent_plans enable row level security;
alter table public.agent_actions enable row level security;
alter table public.agent_audit_log enable row level security;
alter table public.agent_signals enable row level security;

create policy "own agent connections" on public.agent_connections for select to authenticated using (user_id = auth.uid());
create policy "own agent plans" on public.agent_plans for select to authenticated using (user_id = auth.uid());
create policy "own agent actions" on public.agent_actions for select to authenticated using (user_id = auth.uid());
create policy "own agent audit" on public.agent_audit_log for select to authenticated using (user_id = auth.uid());
create policy "own agent signals" on public.agent_signals for select to authenticated using (user_id = auth.uid());

-- New tables need explicit grants since 2026-10-30.
grant select on public.agent_connections, public.agent_plans, public.agent_actions,
  public.agent_audit_log, public.agent_signals to authenticated;
grant select, insert, update, delete on public.agent_connections, public.agent_plans,
  public.agent_actions, public.agent_audit_log, public.agent_signals to service_role;
