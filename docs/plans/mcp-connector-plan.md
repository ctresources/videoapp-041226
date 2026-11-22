# SparkReels shared agent layer: architecture (revision 5)

2026-11-22.
- **Revision 4:** follows the owner's architecture spec.
- **Revision 5:** the owner's staging. Blog and social copy move into V1 because the app already has working logic for both. Only the CRM actions wait for V1.1, because they need more careful permissions and approval design.

**APPROVED for implementation on 2026-11-22, with two more requirements (below).**

## Approval conditions (2026-11-22)

**A. Keep every existing route working while logic moves into shared services.**
- Business logic moves into reusable `lib/` functions. The current app routes and the new agent/MCP tools both call those same functions.
- `/api/ai/blog`, `/api/ai/share-kit` and the video, publishing and scheduling routes are **not removed, renamed or changed in behavior** by this refactor. The only exception is a verified bug, and it gets called out when it happens.
- **Parity tests** check that the app's own workflow and the agent/MCP workflow:
  - produce equivalent results
  - enforce the same plan limits
  - apply the same My Voice settings
  - apply the same Fair Housing rules
  - enforce the same permissions

**B. An explicit approval state machine.**

```
PLAN    proposed ──approve_plan──▶ approved ──(steps run)──▶ completed
           │  └──edit──▶ proposed (new version, new hash)        │
           └──cancel──▶ cancelled        approved ──24 h──▶ expired

PUBLISH prepared ──confirm_publish──▶ running ──▶ posted | scheduled | failed
           └──30 min──▶ expired

CRM     prepared ──confirm_crm_send──▶ running ──▶ sent | failed      (V1.1)
           └──30 min──▶ expired
```

- **`approve_plan` authorizes creation only:** making a video, blog or social copy, including the credits those use.
- **`approve_plan` never authorizes publishing, scheduling or CRM sending,** even when the plan lists posts. A plan's posting steps only *prepare* actions.
- **Publishing and scheduling** always need their own `confirm_publish`. It shows:
  - the exact asset (the finished video, with its link)
  - the destinations
  - the date and time
  - the time zone
- **CRM sending (V1.1)** has its own `confirm_crm_send`, showing the CRM, the audience and recipient count, and the message, before anything is sent.
- Each action type has its own row type in `agent_actions`. A confirmation for one type can never carry out another.

## Product rules (authoritative)

1. Existing app logic is **reused, never copied**.
2. Existing plan limits remain authoritative.
3. Existing Fair Housing logic remains authoritative.
4. Existing My Voice settings remain authoritative.
5. Existing connected-platform permissions remain authoritative.
6. MCP does not create a second business-logic system.
7. `plan_spark` comes before execution.
8. Approval, idempotency, timezone handling and auditing are core requirements, not later enhancements.

**Layers, from the bottom up:**
1. SparkReels Core does the work.
2. The Shared Agent Layer decides what should happen.
3. Adapters are only entry points.
4. The clients on top: ChatGPT, Claude, Sparklee, eXp Hub, HALO, BoldTrail, GHL and others.

There is one engine and one brain.

---

## 1. Architecture diagram

```
 CLIENTS / SOURCES                    ADAPTERS (entry points only)
 ─────────────────                    ────────────────────────────
 ChatGPT, Claude, other MCP apps ──▶  /api/mcp            (MCP, OAuth or key)
 eXp Hub bot ─────────────────────▶  hub adapter          (later)
 In-app Sparklee ─────────────────▶  in-app adapter       (session cookie)
 HALO events / webhooks ──────────▶  halo adapter         (signed webhook)   V1.1
 BoldTrail API / webhooks / MCP ──▶  boldtrail adapter                       V1.1
 GoHighLevel API / workflows / MCP ▶  ghl adapter                             V1.1
                                              │
                                              │  runAgent({ actor, source, adapter,
                                              │            tool, input, requestId })
                                              ▼
 ┌──────────────────────── lib/agent/  ONE SHARED AGENT LAYER ───────────────────────┐
 │  1  authenticate / identify user          auth/ (AuthProvider: oauth | key |      │
 │                                                  session | webhook)               │
 │  2  load plan + remaining usage           context.ts  ─┐                          │
 │  3  load feature entitlements                          │ one AgentContext,        │
 │  4  load brand / My Voice / market / tz                │ loaded once per call     │
 │  5  load connected platforms + context    ─────────────┘                          │
 │  6  apply Fair Housing + guardrails       guard.ts (scopes, profile, plan rules)   │
 │  7  interpret the goal                  ┐                                         │
 │  8  run plan_spark                      ├ tools/plan-spark.ts  (the brain)         │
 │  9  show proposed plan                  ┘ agent_plans                              │
 │  10 require approval where needed         approvals.ts  (agent_actions)            │
 │  11 execute approved tool                 tools/*.ts → existing services           │
 │  12 enforce idempotency                   idempotency.ts (agent_actions)           │
 │  13 log the action                        audit.ts (agent_audit_log)               │
 │  14 return status / result                AgentResult                              │
 └───────────────────────────────────────────────────────────────────────────────────┘
                                              │
                                              ▼
 EXISTING SPARKREELS CORE (reused, never copied)
 script writers · My Voice · Fair Housing · startRender + render queue · plan limits
 and credits · Upload-Post / YouTube publishing · scheduling · CRM video email ·
 blogs · calendar · insights · connected-platform checks · HALO / BoldTrail / GHL clients
```

---

## 2. V1 tool list (video first)

| Tool | Purpose | Creates or uses credits? | Scope |
|---|---|---|---|
| `get_account` | Plan, videos left and renewal date, enabled features, connected platforms, market, time zone, twin/voice ready | No | `account:read` |
| `plan_spark` | Goal → recommended Spark plan (see below). Also edits a plan (`plan_id` + change) | **No, never** | `sparks:plan` |
| `approve_plan` | `plan_id` + `approve` or `cancel`. Records the approval against the plan's hash | No | `sparks:plan` |
| `write_script` | Topic or approved plan → script options, title, opening, closing line | No (30 a day cap) | `sparks:write` |
| `revise_script` | Refine a script conversationally, or pick a version | No | `sparks:write` |
| `make_video` | Starts rendering an approved video through the existing render system | **Uses 1 video** | `videos:create` |
| `video_status` | Rendering, ready or failed, with a plain-language error | No | `videos:read` |
| `list_videos` | Recent videos and drafts | No | `videos:read` |
| `publish_video` | **Prepare step:** returns the exact video, destinations, captions and an `action_id`. Posts nothing | No | `publish:write` |
| `schedule_video` | **Prepare step:** the same, with the date and time in the profile time zone | No | `publish:write` |
| `confirm_publish` | `confirm_publish(action_id)` actually publishes or schedules | No | `publish:write` |
| `make_blog` | Writes the full blog post for a Spark from its script (1,000–1,500 words, H2 sections), the same as the app's blog writer. Fills gaps only, unless asked to rewrite | No | `sparks:write` |
| `make_social_copy` | Writes the Share Kit copy for a video from its words: LinkedIn and Facebook posts, Instagram caption, YouTube title and description. Works for listing videos and uploaded clips | No | `sparks:write` |

`approve_plan` and `confirm_publish` aren't extra features. They are how the approval rules work: plan approval before creating, confirmation before posting.

**What `plan_spark` returns.** Nothing is created yet:
- Recommended Spark Plan: its steps (e.g. listing video, Facebook + Instagram post, YouTube version, listing social copy, optional CRM follow-up)
- the subscription features each step uses
- the video credits needed against those remaining
- which connected platforms are available, and which are not connected
- an **upgrade opportunity**, kept separate, for any useful step the plan doesn't include. It's never folded into the plan silently.
- the next actions: **Approve Plan / Edit Plan / Cancel**

**What it looks at:**
- the plan, remaining usage and enabled features
- recent Sparks and the calendar
- connected platforms and CRM connections
- market, brand and My Voice
- the goal
- available source content (listings, HALO articles, imports)

It only recommends workflows the user can actually run.

**Steps it can already recommend, marked "coming soon":** CRM follow-up (BoldTrail, GHL). It runs once the V1.1 CRM tools exist. Blog and social copy run in V1.

---

## 3. Auth flow

**Primary: SparkReels OAuth on Supabase OAuth 2.1.**

```
AI client                     SparkReels                      Supabase Auth (OAuth 2.1 server)
   │  call /api/mcp (no token) ─▶ 401 + WWW-Authenticate:
   │                              resource_metadata=/.well-known/oauth-protected-resource
   │  read metadata ────────────▶ { authorization_servers: [supabase issuer], scopes }
   │  register client (dynamic registration) ─────────────────▶ client_id
   │  open authorize URL ─────────────────────────────────────▶ redirects user to
   │                              /oauth/consent  ◀────────────  SparkReels consent page
   │                              user signs in (normal SparkReels login),
   │                              sees client name + scopes, taps Allow
   │                              ─ approve authorization ─────▶ auth code → token
   │  call /api/mcp with Bearer token
   │                              verify JWT (issuer, audience, expiry, JWKS),
   │                              read user + client_id → AgentActor
```

- The consent page refuses free accounts with an upgrade message ("External AI connections are part of paid plans") and creates no grant.
- **Every call checks the plan again,** so downgrading to free stops access on the next call.
- **Modular.** `AuthProvider.resolve(req) → { userId, clientId, connectionId, scopes, source }`. The Supabase provider is one implementation. Swapping to another OAuth server changes only `lib/agent/auth/`.
- **Beta caveat.** Supabase's OAuth server is in beta. The exact client-library calls and dashboard settings get confirmed against the current Supabase docs at build time.

**Fallback: Personal Access Keys** (Settings → Connections → Advanced):
- a user-defined name
- scopes picked from the same list
- the full key (`sr_pat_…`) shown once and stored only as a SHA-256 hash
- last used
- optional expiry (30, 90 or 365 days, or never)
- revoked one at a time
- the same paid-plan check

**Other adapters:**
- **In-app Sparklee** uses the normal session cookie (`source: sparklee_in_app`).
- **Webhooks** (HALO, later BoldTrail/GHL) use signed requests, mapped to the user who owns that site or account.

**Scopes:** `account:read`, `sparks:plan`, `sparks:write`, `videos:create`, `videos:read`, `publish:write`.

**Settings → Connections** shows each AI client and key with:
- scopes in plain words
- date connected
- last used
- **Disconnect / Revoke**

A mockup comes before the build.

---

## 4. Approval flow

Approval happens at two points:

**A. Plan approval (before anything is created or any credit is used)**
```
plan_spark ──▶ plan stored (agent_plans, status=proposed, plan_hash)
           ──▶ client shows plan: Approve Plan / Edit Plan / Cancel
approve_plan(plan_id, approve) ──▶ server checks: plan belongs to user, not expired
                                   (24 h), hash unchanged, still fits plan limits
                                ──▶ status=approved
Edit Plan  ──▶ plan_spark(plan_id, change) → new version, new hash, approval reset
```
- `make_video` and `write_script` run only for an approved plan step.
- A direct call with no plan becomes a one-step plan that needs approval first.

**B. Publish/schedule confirmation (after the video exists)**
```
publish_video / schedule_video ──▶ agent_actions row: kind=publish, status=prepared,
                                   exact video_id, platforms, captions, UTC time +
                                   local wording, payload_hash, expires in 30 min
                               ──▶ returns preview + action_id   (nothing posted)
confirm_publish(action_id)     ──▶ server checks: same user, status=prepared, not
                                   expired, payload_hash unchanged, platforms still
                                   connected, video ready ──▶ executes once
```
- **The person sees the finished video before it posts,** because confirmation happens after the render.
- **Where the client supports MCP elicitation,** confirmation is shown to the user as a form the client renders directly. The server records that the yes came from the user's form.
- **Nothing publishes, schedules, sends or contacts a CRM lead without this,** unless the user has separately turned on an approved automation in SparkReels (for example AutoSparks auto-post). Those automations stay governed by their existing in-app settings.

---

## 5. Idempotency design

**Covered:** everything that can use a credit, create a video, publish, schedule or send a CRM message.

**Table `agent_actions`:**
- `id` (the action_id)
- `user_id`, `connection_id`
- `tool`
- `request_id`: the client's key, or one derived from user + tool + payload hash + a 10-minute window
- `payload_hash`
- `status`: prepared, approved, running, succeeded or failed
- `result` (jsonb)
- `plan_id`, `step`
- `created_at`, `updated_at`
- **unique (user_id, tool, request_id)**

**Flow:**
1. **Insert first.** Insert the action row with `status=running` *before* calling the core service. A unique-key conflict means it's a repeat: return the stored result, or "still running", without calling the service again.
2. **Same key, different payload.** Refused with `idempotency_conflict`.
3. **Plan steps.** Each step's key is `plan_id + step + approval_id`, so retrying `run`/`make_video` for a plan finishes only the steps that haven't finished.
4. **Credits.** `startRender` already takes the credit when it creates the render. Because the action row is claimed first, a retry never reaches `startRender` a second time. No change to the core's credit logic is needed.
5. **Publishing.** `confirm_publish` flips `prepared → running` with a conditional update (`where status = 'prepared'`). Two confirms can't both post.
6. **Failures.** A failed action stores the plain error. A deliberate new attempt uses a new request_id.

---

## 6. Audit-log design

**Table `agent_audit_log`:** one row per meaningful action (every tool call, and each plan step it runs).

| Column | Example |
|---|---|
| `user_id` | … |
| `source` (client) | ChatGPT, Claude, Sparklee in-app, eXp Hub, HALO, BoldTrail, GoHighLevel, or a key's name |
| `adapter` | mcp, hub, in_app, halo, boldtrail, ghl |
| `connection_id` | the OAuth grant or key used |
| `tool` | `plan_spark`, `make_video`, … |
| `request_id` / `action_id` / `plan_id` | links to `agent_actions` / `agent_plans` |
| `approval_state` | not_needed, proposed, approved, confirmed, expired, cancelled |
| `spark_id` / `video_id` / `publish_job_id` | whatever was affected |
| `result` | ok, needs_approval, needs_input, denied, error |
| `error_code`, `error_message` | plain text |
| `input_summary` | short; never tokens, keys or full scripts |
| `created_at` | timestamp |

- Denials that look like probing (scopes not granted, another user's IDs) are also written to `security_events`, so they appear in the Monday watch email.
- Settings → Connections can show each client's recent actions from this table.
- RLS: users read only their own rows. Only the service role writes.

---

## 7. How adapters call lib/agent

Each adapter does three things only: **authenticate, translate, render.**

```ts
// lib/agent/index.ts: the only door into the layer
runAgent({
  actor,        // from AuthProvider: userId, connectionId, scopes, source, adapter
  tool,         // "plan_spark" | "make_video" | ...
  input,        // validated against the tool's schema
  requestId,    // optional idempotency key from the client
}): Promise<AgentResult>
// AgentResult = { status: ok | needs_approval | needs_input | denied | error,
//                 data, message /* plain language */, planId?, actionId? }
```

| Adapter | Authenticates with | Translates | Shows the result as |
|---|---|---|---|
| `/api/mcp` | OAuth token or key | MCP tool call → `runAgent` (one MCP tool per agent tool) | MCP tool result, plus elicitation for confirmations |
| In-app Sparklee | Session cookie | A chat message or button → `runAgent` (`plan_spark` first) | Plan card with Approve / Edit / Cancel |
| eXp Hub (later) | Hub webhook signature + linked account | A DM → `runAgent(plan_spark)` (Hub profile allows `get_account` and `plan_spark` only) | Plan text plus a link into SparkReels to approve and run |
| HALO / BoldTrail / GHL (V1.1) | Webhook signature or API poll | An event → `runAgent(plan_spark, { signal })` | A suggested plan in AutoSparks / Sparklee, waiting for approval |

**No adapter picks tools for a goal.** Goals always go to `plan_spark`.

---

## 8. What each tool reuses

| Tool | Existing code it calls | Work needed |
|---|---|---|
| `get_account` | `lib/access.ts` (`getAccessLevel`, `canAccessFeature`), allowance logic in `app/api/profile/allowance/route.ts`, `lib/api/upload-post.ts` (`getProfile`, connected platforms), `profiles` (market, time_zone), `lib/api/my-voice.ts` | **Move** the allowance logic into `lib/usage/allowance.ts`; the route and the tool both call it |
| `plan_spark` | All of the above, plus recent `projects`/`generated_videos`, the calendar (`campaigns`), and the idea sources behind `app/api/ai/weekly-suggestions` and `trending-topics`, plus the AutoSparks weekly-mix rules | New: the planner itself. It must call the existing idea and mix code, not rewrite it (see §9) |
| `write_script` | Script creation in `app/api/ai/generate-location-script/route.ts` (Fair Housing, My Voice, `scriptWithoutRepeats`, clamps), two versions from `app/api/ai/topic-chat/route.ts` | **Move** both into `lib/scripts/` functions; the routes become thin |
| `revise_script` | `topic-chat` refine and pick (learns My Voice) | Same move as above |
| `make_video` | `lib/video/start-render.ts` `startRender()` and `lib/video/render-queue.ts` (10-at-once limit, credits) | None. It's already a library function. The tool reads its result |
| `video_status` | Status logic in `app/api/video/status/route.ts` (it also finishes renders as it checks) | **Move** into `lib/video/status.ts` so polling from MCP finishes renders exactly like the app does |
| `list_videos` | The My Content queries (`projects`, `generated_videos`) | Small shared query in `lib/` |
| `publish_video` / `schedule_video` / `confirm_publish` | Publishing in `app/api/social/post/route.ts` and `app/api/social/schedule/route.ts`, `lib/api/upload-post.ts` (`publishVideo`), the YouTube branch, `publish_jobs` (already has `time_zone`) | **Move** the post and schedule logic into `lib/social/publish.ts`; routes and tools both call it |
| `make_blog` | Blog writer in `app/api/ai/blog/route.ts` (194 lines; blog_intro/body/conclusion, H2 sections, Fair Housing) | **Move** into `lib/content/blog.ts`; the route and the tool both call it |
| `make_social_copy` | Share Kit writer in `app/api/ai/share-kit/route.ts` (149 lines; LinkedIn, Facebook, Instagram, YouTube copy from the video's words; refuses when there are too few words) | **Move** into `lib/content/share-kit.ts`; the route and the tool both call it |
| (all) | `lib/utils/fair-housing.ts`, `lib/api/my-voice.ts`, connected-platform checks | Used through the moved functions, never called separately |

---

## 9. Anything that would require duplicating logic

**Nothing needs to be duplicated if the moves above are done first.** Things to watch:

1. **Logic locked inside API routes.** Allowance, script creation, topic chat, video status, social post, schedule, blog and Share Kit live inside route files (130–590 lines each). The tools can't call a route without faking an HTTP request. So each gets **moved** (not copied) into a `lib/` function, and the route keeps calling it. This touches live routes, so it's done one at a time with a build check, before the tools are added.
2. **There are already several "brains".** AutoSparks' weekly picker, Sparklee "make it", HALO → video (`lib/halo/make.ts`) and seller-update cards each decide what to make. If `plan_spark` writes its own recommendation logic, that's two brains. So:
   - **V1:** `plan_spark` calls the same idea, mix and HALO functions those features use.
   - **V1.1 onwards:** AutoSparks, Sparklee and HALO switch to calling `plan_spark`, so there's one brain.
3. **`startRender` returns an HTTP-style response.** The tool unpacks it. It's not worth changing the core for this.
4. **Upgrade opportunities** must read `lib/access.ts`, never a separate list of what each plan includes.

---

## 10. Deferred to V1.1 (CRM, which needs careful permissions and approval design)

- **BoldTrail follow-up and GoHighLevel follow-up,** through the existing BoldTrail/GHL clients and CRM video email
- **Contact targeting:** choosing which contacts or segments get something, with a preview of who's included
- **CRM send actions:** every send prepared, then confirmed, idempotent per contact, and logged
- **CRM-triggered workflows:** BoldTrail and GHL events (and HALO webhooks) as signals into `plan_spark`, which can only propose
- Its own scopes, for example `crm:read` and `crm:send`, shown separately in Settings → Connections

**Also later:**
- AutoSparks / Sparklee / HALO cards moved onto `plan_spark`
- The eXp Hub adapter, after eXp approves the bot
- `find_opportunities`: recent content, calendar, performance, connected sources, CRM opportunities and unused plan capacity → "What should I create next?". It will power Opportunities Sparklee Found, ChatGPT and Claude recommendations, eXp Hub suggestions, and CRM-triggered ideas. The `agent_plans` / `agent_signals` design leaves room for it.
- `cancel_schedule`, insights tools, listing video from a link
- A ChatGPT app listing and the Claude connector directory

## V1 build order (after approval)

1. **Move route logic into `lib/`:** allowance, scripts, topic chat, status, publish/schedule, blog, Share Kit. Each move gets its own build check and keeps the app working the same. About 2.5 days.
2. **Core:** AuthProvider (Supabase OAuth, keys, session), context, guard, `agent_plans`, `agent_actions`, `agent_audit_log`, `agent_connections`, with GRANTs and RLS. About 2–3 days.
3. **The brain:** `plan_spark` and `approve_plan`. About 2 days.
4. **MCP adapter:** `/api/mcp`, protected-resource metadata, consent page, and all V1 tools. About 2 days.
5. **Settings → Connections:** mockup first, then the build. About 1 day.
6. **Testing** in Claude and ChatGPT: "Market my listing" end to end (video, blog, social copy, publish), free plan refused, limits, retries, edited or expired approvals, no time zone, revoked access. About 1 day.
7. **Docs:** a How It Works step, What's New, and a public page. Half a day.

**About 2–2.5 weeks.** In-app Sparklee can switch to the layer right after.
