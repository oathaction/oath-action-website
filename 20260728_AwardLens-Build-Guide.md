# AwardLens — Build Guide

**Version:** 2026-07-28
**Applies to:** the application in `awardlens/` inside the `oath-action-website` repository
**Framework:** Next.js 16.2.12 (App Router), React 19.2.4, TypeScript 5, Tailwind CSS 4

This guide is written against the code as it exists in the repository. Where a
capability is not built yet, it says so. Nothing here describes a feature that
is not in the source tree.

---

## Table of contents

1. [Product overview](#1-product-overview)
2. [Architecture diagram](#2-architecture-diagram)
3. [Repository structure](#3-repository-structure)
4. [Prerequisites](#4-prerequisites)
5. [Account and service setup](#5-account-and-service-setup)
6. [Installation](#6-installation)
7. [Environment variables](#7-environment-variables)
8. [Supabase configuration](#8-supabase-configuration)
9. [Database migrations](#9-database-migrations)
10. [Storage bucket](#10-storage-bucket)
11. [AI Gateway configuration](#11-ai-gateway-configuration)
12. [Model selection](#12-model-selection)
13. [Stripe setup](#13-stripe-setup)
14. [Stripe webhooks](#14-stripe-webhooks)
15. [Resend setup](#15-resend-setup)
16. [Scheduled reminders](#16-scheduled-reminders)
17. [Local development](#17-local-development)
18. [Deterministic fixture mode](#18-deterministic-fixture-mode)
19. [Test commands](#19-test-commands)
20. [Live AI evaluation](#20-live-ai-evaluation)
21. [Production build](#21-production-build)
22. [Vercel deployment](#22-vercel-deployment)
23. [Custom domain](#23-custom-domain)
24. [Post-deployment smoke tests](#24-post-deployment-smoke-tests)
25. [Monitoring](#25-monitoring)
26. [Backups and deletion](#26-backups-and-deletion)
27. [Common problems](#27-common-problems)
28. [Rollback](#28-rollback)
29. [One-day MVP path](#29-one-day-mvp-path)
30. [One-week build path](#30-one-week-build-path)
31. [Pilot launch checklist](#31-pilot-launch-checklist)

---

## 1. Product overview

AwardLens takes a grant award document — an award letter, a grant agreement, a
notice of award — and produces a register of what the recipient organisation
actually has to do: reporting deadlines, financial restrictions, prior-approval
triggers, match requirements, records retention, acknowledgement rules, and so
on. Every item in the register carries a citation back to the passage of the
document it came from.

The product's central claim is narrow and testable: **AwardLens will not tell
you your award says something it does not say.** Three mechanisms in the code
enforce that claim.

* **Locators come from the document, never from the model.**
  `src/lib/ai/citations.ts` takes the model's quoted excerpt, searches the
  stored document segments for it, and reads the page/section/paragraph number
  off the segment the quote was actually found in. A quote the model attributes
  to page 7 but which lives on page 3 is cited as page 3. A quote that exists
  nowhere in the document gets no locator at all.
* **Consolidation is deterministic code, not a model call.**
  `src/lib/ai/consolidate.ts` merges duplicate candidates by category and
  wording similarity. When two merged candidates state different due dates for
  the same requirement, the merged obligation stores **no** due date and carries
  both dates as an unresolved `dateConflicts` entry plus a clarification
  question. A contradiction in the source is never silently resolved.
* **Nothing is auto-confirmed.** Every obligation the pipeline produces is
  persisted with `reviewStatus: "needs_review"`
  (`src/lib/awards/process.ts`). Only a person moves an item to `confirmed`,
  and only confirmed, dated obligations generate email reminders
  (`src/lib/reminders/index.ts`).

The application also runs with **zero external credentials**. `getServerConfig()`
in `src/lib/env/index.ts` derives four independent operating modes and upgrades
each one as its credentials appear. With no `.env` file at all you get a fully
working product: local file storage, deterministic rule-based extraction,
development billing, and sign-in codes printed to the screen. That is what makes
the demo, CI, and a from-scratch `pnpm dev` work without an account anywhere.

**What AwardLens is not.** It is decision support for grants operations. The
prompts in `src/lib/ai/prompts.ts` explicitly forbid the model from stating a
legal, accounting, tax or compliance conclusion, and the UI and email footers
repeat that. It does not certify compliance, and this guide does not claim it
does.

**Not built yet, stated plainly:**

* The **Supabase adapter is not wired in.** Fifteen source files import
  `@/lib/db/local` directly. The SQL in `awardlens/supabase/` is the production
  schema and it is complete, but nothing in the running application talks to it.
  See [§8](#8-supabase-configuration).
* **OCR is not supported.** A scanned PDF with no text layer is rejected with a
  specific message; the user is told to paste the text instead.
* The **Team plan** exists as a price tier in `src/lib/billing/plans.ts` with a
  50-award limit and a "shared organisation workspace" line item, but multi-user
  organisations are not implemented — `getOrCreateOrganizationForUser` gives
  every user exactly one organisation and there is no invite flow.
* There is **no accessibility conformance claim**. `pnpm test:accessibility`
  runs `tests/e2e/accessibility.spec.ts` if that spec exists; as of this writing
  `tests/e2e/` contains `auth.spec.ts`, `marketing.spec.ts`,
  `upload-and-review.spec.ts` and `helpers.ts`, so that one script has no
  target. See [§19](#19-test-commands).

---

## 2. Architecture diagram

```mermaid
flowchart TD
  subgraph CLIENT["Browser"]
    UI["React Server Components plus client islands"]
  end

  subgraph EDGE["Next.js 16 App Router - one Vercel project, Root Directory = awardlens"]
    MKT["Route group marketing - / and /pricing and /demo"]
    AUTHR["Route group auth - /auth/sign-in"]
    APPR["Route group app - /app/** behind requireSession"]
    ACTIONS["Server Actions - src/app/actions"]
    ROUTES["Route Handlers - src/app/api"]
  end

  subgraph DOMAIN["Server-only domain layer - src/lib"]
    CONFIG["env/index.ts - getServerConfig, four graded modes"]
    SESSION["auth - HMAC signed cookie plus six-digit code"]
    PROCESS["awards/process.ts - ingest and reprocess"]
    QUERIES["awards/queries.ts - workspace and dashboard"]
    PARSE["documents - validation, parse, segment"]
    PIPE["ai/pipeline.ts - staged extraction"]
    CITE["ai/citations.ts - locator read from stored segment"]
    CONS["ai/consolidate.ts - deterministic merge"]
    FIX["ai/fixtures.ts - rule-based extractor"]
    MODEL["ai/model.ts - gateway client, AI_MODEL"]
    BILL["billing - plans and Stripe checkout"]
    REM["reminders - schedule and send"]
    MAIL["email - Resend or console"]
    EXP["exports - csv, ics, json"]
    RL["security/rate-limit.ts - in-process fixed window"]
  end

  subgraph STORE["Persistence"]
    LOCAL["db/local.ts - file-backed store, default"]
    SUPA["supabase/migrations - Postgres plus RLS, not yet wired"]
  end

  subgraph EXT["External services - all optional"]
    GW["Vercel AI Gateway"]
    STRIPE["Stripe Checkout and webhooks"]
    RESEND["Resend"]
    CRON["Vercel Cron"]
  end

  UI --> MKT
  UI --> AUTHR
  UI --> APPR
  APPR --> ACTIONS
  UI --> ROUTES
  APPR --> SESSION
  ACTIONS --> SESSION
  ROUTES --> SESSION

  ROUTES --> PROCESS
  ACTIONS --> PROCESS
  APPR --> QUERIES
  ACTIONS --> QUERIES
  ROUTES --> EXP

  PROCESS --> PARSE
  PROCESS --> PIPE
  PIPE --> CITE
  PIPE --> CONS
  PIPE --> CONFIG
  PIPE --> FIX
  PIPE --> MODEL
  MODEL --> GW
  ROUTES --> RL
  ACTIONS --> RL

  PROCESS --> LOCAL
  QUERIES --> LOCAL
  SESSION --> LOCAL
  REM --> LOCAL
  BILL --> LOCAL
  LOCAL -.->|"seam to swap, not implemented"| SUPA

  ACTIONS --> BILL
  BILL --> STRIPE
  STRIPE --> ROUTES
  REM --> MAIL
  MAIL --> RESEND
  CRON --> ROUTES
  ROUTES --> REM
```

### The eight-stage extraction pipeline

```mermaid
flowchart TD
  S1["Stage 1 - Intake<br/>validate, SHA-256 hash, dedupe, create award and document, store bytes"]
  S2["Stage 2 - Read<br/>parse PDF, DOCX or text; strip running headers; segment with honest locators"]
  S3["Stage 3 - Award profile<br/>funder, recipient, amount, period, governing documents"]
  S4["Stage 4 - Obligation candidates<br/>batched over segments, max 6 segments or 11000 chars per batch"]
  S7["Stage 7 - Completeness critic<br/>separate pass looking only for what stage 4 missed"]
  S6["Stage 6 - Citation validation<br/>excerpt matched back to stored segments; locator read from the match"]
  DROP{"Any citation resolved<br/>to a real segment?"}
  DISCARD["Discarded and counted<br/>in droppedUnsupported"]
  S5["Stage 5 - Consolidation<br/>deterministic merge; conflicting dates preserved, never resolved"]
  PLAUS["Date plausibility check<br/>dates far outside the award period are cleared, not kept"]
  S8["Stage 8 - Persist<br/>every obligation saved as needs_review"]

  S1 --> S2 --> S3 --> S4 --> S7 --> S6 --> DROP
  DROP -- no --> DISCARD
  DROP -- yes --> S5 --> PLAUS --> S8

  MODE{"aiMode - stages 3, 4 and 7"}
  RULE["ai/fixtures.ts rule-based extractor<br/>reads the real document, quotes it verbatim"]
  LLM["generateObject via AI Gateway<br/>model id from AI_MODEL"]
  MODE -->|"fixtures"| RULE
  MODE -->|"live"| LLM
```

**Two notes on the diagram, because the numbering is conceptual and the
execution order is not identical.**

1. The stage numbers come from the comments in `src/lib/ai/pipeline.ts` and
   `src/lib/awards/process.ts`. In the actual code, the completeness critic
   (stage 7) runs *before* consolidation (stage 5) and citation validation
   (stage 6) — deliberately, so its proposals merge with the main pass and face
   exactly the same evidence checks. Citations are in fact resolved inline for
   each candidate as it is produced; the "checking_sources" stage is where
   unsupported candidates are dropped in bulk.
2. The six stage names the user sees in the upload progress UI are the
   `PROCESSING_STAGES` union in `src/lib/domain/types.ts`:
   `securing_document`, `reading_document`, `identifying_award`,
   `finding_obligations`, `checking_sources`, `preparing_review`. They are
   streamed to the browser as real transitions — see
   [§18](#18-deterministic-fixture-mode) and the NDJSON note in
   [§24](#24-post-deployment-smoke-tests).

In fixture mode the pipeline still runs stages 1, 2, 3, 4, 6, 5 and 8. The
completeness critic (stage 7) is a model-only pass and does not run.

---

## 3. Repository structure

AwardLens lives in a subdirectory of an otherwise static site. The repository
root is a GitHub Pages site (plain HTML, `.nojekyll`, a Pages workflow in
`.github/`). `awardlens/` is a self-contained Next.js application with its own
`package.json` and lockfile. Nothing in `awardlens/` is referenced by the static
site and nothing in the static site is referenced by the app.

```
oath-action-website/
├── index.html, about.html, …            static Oath & Action site
├── assets/                              static site assets
├── .github/workflows/                   GitHub Pages deploy
└── awardlens/                           ← the Next.js application
    ├── package.json                     scripts and dependencies
    ├── pnpm-lock.yaml
    ├── pnpm-workspace.yaml              ignoredBuiltDependencies: sharp, unrs-resolver
    ├── next.config.ts                   currently empty (no custom config needed)
    ├── vercel.json                      daily cron + security headers (§16, §22)
    ├── .env.example                     annotated template for every variable
    ├── tsconfig.json                    strict; "@/*" → "./src/*"
    ├── vitest.config.ts                 aliases `server-only` to a stub for tests
    ├── playwright.config.ts             e2e against `next dev`, serial, temp data dir
    ├── eslint.config.mjs                eslint-config-next core-web-vitals + typescript
    ├── postcss.config.mjs               @tailwindcss/postcss
    ├── AGENTS.md / CLAUDE.md            agent instructions for this repo
    ├── README.md                        short product-level orientation
    ├── scripts/
    │   └── list-models.mjs              `pnpm models:list`
    ├── public/                          default Next.js SVGs only
    ├── supabase/
    │   ├── README.md                    schema, RLS strategy, negative test suite
    │   ├── migrations/
    │   │   ├── 0001_initial_schema.sql  16 tables, enums, indexes, triggers
    │   │   ├── 0002_row_level_security.sql
    │   │   └── 0003_storage.sql         private award-documents bucket + policies
    │   └── seed.sql                     guarded demo dataset
    ├── tests/
    │   ├── fixtures/                    12 synthetic award documents + manifest.json
    │   ├── unit/                        13 test files, pure logic, no network
    │   ├── integration/
    │   │   ├── pipeline.test.ts         real ingestion against the real file store
    │   │   └── extraction-eval.test.ts  all 12 fixtures vs. the manifest
    │   └── e2e/                         Playwright: auth, marketing, upload-and-review
    └── src/
        ├── app/
        │   ├── layout.tsx               fonts, metadata, Toaster
        │   ├── globals.css              design tokens + print stylesheet
        │   ├── error.tsx, not-found.tsx
        │   ├── (marketing)/             /, /pricing, /demo
        │   ├── (auth)/auth/sign-in/
        │   ├── (app)/app/               dashboard, settings, awards/new,
        │   │                            awards/[awardId]{,/review,/obligations,/plan,/ask}
        │   ├── actions/                 ask, auth, awards, obligations, settings
        │   └── api/
        │       ├── awards/ingest/route.ts                    NDJSON upload stream
        │       ├── awards/[awardId]/export/[format]/route.ts csv | ics | json
        │       ├── webhooks/stripe/route.ts
        │       └── cron/reminders/route.ts
        ├── components/
        │   ├── ui/                      hand-written Radix primitives
        │   ├── app/, award/, documents/, evidence/, marketing/, obligations/
        └── lib/
            ├── env/index.ts             ← the graded-mode system
            ├── domain/{types,dates}.ts
            ├── documents/{validation,parse,segment}.ts
            ├── ai/{schemas,prompts,model,citations,consolidate,pipeline,fixtures,ask,suggested-questions}.ts
            ├── db/local.ts              file-backed store
            ├── auth/{index,session}.ts
            ├── awards/{process,queries}.ts
            ├── billing/{plans,stripe}.ts
            ├── email/index.ts
            ├── reminders/index.ts
            ├── exports/{csv,ics,json}.ts
            ├── security/rate-limit.ts
            ├── samples/sample-award.ts
            └── utils.ts
```

Two things to know about the tree as it stands:

* `awardlens/README.md` is a short orientation for someone opening the
  repository. This guide is the operational reference; they are not duplicates
  and where they disagree, check the code.
* `.gitignore` covers `/.awardlens-data/` and `.env*`, so the local file store
  (which contains uploaded award text and a generated auth secret) and your
  environment file stay out of version control. Verify this before your first
  commit if you have changed `.gitignore`.

---

## 4. Prerequisites

| Tool | Minimum | Built and verified with |
| --- | --- | --- |
| Node.js | 20.9 (the floor for Next.js 16) | **22.22.2** |
| pnpm | 9 | **10.33.0** |
| Git | any recent | — |
| Supabase CLI | only if you apply the SQL in `supabase/` | — |
| Stripe CLI | only for local webhook testing | — |

Nothing else is required. There is no Docker requirement, no native build step,
no Postgres requirement to run the app, and no API key requirement to run the
app or the tests.

```bash
node --version    # expect v20.9.0 or newer; this build used v22.22.2
pnpm --version    # this build used 10.33.0
```

If pnpm is not installed:

```bash
corepack enable
corepack prepare pnpm@10.33.0 --activate
```

`pnpm-workspace.yaml` lists `sharp` and `unrs-resolver` under
`ignoredBuiltDependencies`, so pnpm will not run their postinstall scripts. That
is intentional and you should not "fix" it.

---

## 5. Account and service setup

Every one of these is optional. The application runs without all of them. Set
them up in this order only when you want the corresponding mode to upgrade.

| Service | Unlocks | Needed for a production launch? |
| --- | --- | --- |
| **Vercel** | Hosting, Cron, AI Gateway | Yes, if you deploy to Vercel |
| **Vercel AI Gateway** | Live model extraction and "Ask this award" | Yes for a real product; no for a demo |
| **Resend** | Transactional email | **Yes — without it nobody can sign in to a production deployment.** See [§15](#15-resend-setup) |
| **Stripe** | Real payments | Only when you charge money |
| **Supabase** | Durable Postgres + private object storage | Yes for real customer data — but the adapter is not written yet ([§8](#8-supabase-configuration)) |

Order of setup for a first production deployment:

1. Vercel project (with **Root Directory = `awardlens`**).
2. `AUTH_SECRET` — the code throws in production without it.
3. Resend — otherwise sign-in is impossible in production.
4. AI Gateway key + `AI_MODEL` — otherwise extraction stays deterministic.
5. `CRON_SECRET` + `vercel.json` — otherwise reminders never run.
6. Stripe — only when you are ready to charge.
7. Supabase — the schema is ready; the application adapter is not.

---

## 6. Installation

```bash
git clone <your-fork-or-remote> oath-action-website
cd oath-action-website/awardlens
pnpm install
pnpm dev
```

Open <http://localhost:3000>. You will get:

* the marketing site at `/`,
* a worked sample at `/demo` built by running the real pipeline over
  `src/lib/samples/sample-award.ts` at build time,
* sign-in at `/auth/sign-in` with the six-digit code printed on screen,
* the full application at `/app`.

No `.env` file is required for any of that. A yellow banner across every
authenticated page (`src/components/app/mode-notice.tsx`) will tell you which
graded modes are active.

To confirm the whole toolchain in one command:

```bash
pnpm verify      # typecheck && lint && test && build
```

---

## 7. Environment variables

All variables are parsed in `src/lib/env/index.ts` with a Zod schema whose
fields are `.optional().catch(undefined)` — a malformed value degrades to
"unset" rather than crashing the process. The resulting `ServerConfig` is
memoised per process.

`describeConfig()` exposes only mode names and booleans to the UI. **No key
material is ever returned to a page, an action, or a response body.**

### Full variable table

| Variable | Required when | What it unlocks / does |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Any deployment not served from `http://localhost:3000` | Absolute URLs in reminder emails, Stripe success/cancel URLs, ICS export links and `metadataBase`. Defaults to `http://localhost:3000`. Must be a valid URL or it is ignored. **Must be present at build time** — `src/app/layout.tsx` reads it directly, so Next.js inlines it. |
| `NEXT_PUBLIC_SUPABASE_URL` | Storage mode `supabase` — all three of these are required together | Sets `storageMode = "supabase"`. Setting only some of the three produces a warning and falls back to `local`. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | as above | as above |
| `SUPABASE_SERVICE_ROLE_KEY` | as above | Server-only paths. Bypasses every RLS policy — never put it in a `NEXT_PUBLIC_*` name or a response body. |
| `SUPABASE_STORAGE_BUCKET` | never | Bucket name. Defaults to `award-documents`, which is what `0003_storage.sql` creates. |
| `AI_GATEWAY_API_KEY` | Live AI mode; also required by `pnpm models:list` | Authenticates to the Vercel AI Gateway. |
| `AI_MODEL` | Live AI mode | The model id. **Never hardcoded anywhere in the codebase.** Get a valid value from `pnpm models:list` ([§12](#12-model-selection)). |
| `AI_CRITIC_MODEL` | never | Runs the completeness critic on a different model from the extractor, so the reviewer is not the same system that produced the claim. Falls back to `AI_MODEL`. |
| `USE_DETERMINISTIC_AI_FIXTURES` | To *leave* fixture mode you must set this to a falsey value | **Defaults to `true`.** Truthy values are `1`, `true`, `yes`, `on` (case-insensitive, trimmed). Anything else is false. Live AI requires this to be false **and** both AI variables set. |
| `STRIPE_SECRET_KEY` | Stripe billing mode | Server-side Stripe client. |
| `STRIPE_WEBHOOK_SECRET` | Stripe billing mode | Signature verification in `/api/webhooks/stripe`. Billing mode requires **both** the secret key and the webhook secret. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | never | Parsed and carried in the config object but **not consumed anywhere in the current code** — checkout is Stripe-hosted, so no client-side key is needed. Set it only if you add a client-side Stripe surface. |
| `STRIPE_SINGLE_AWARD_PRICE_ID` | To sell the Single Award Pack | One-time payment price id. |
| `STRIPE_SMALL_ORG_PRICE_ID` | To sell Small Organisation | Recurring price id. |
| `STRIPE_TEAM_PRICE_ID` | To sell Team | Recurring price id. (The Team plan's multi-user features are not implemented — see [§1](#1-product-overview).) |
| `DEVELOPMENT_BILLING_MODE` | Set to `false` in production | **Defaults to `true` outside production and `false` in production.** When true, `startCheckoutAction` grants the plan directly with no payment and writes a `billing.development_grant` audit event. In a production build it refuses to grant and tells you to configure Stripe. |
| `RESEND_API_KEY` | Email mode `resend` | Its presence alone flips `emailMode` from `console` to `resend`. |
| `EMAIL_FROM` | never | Defaults to `AwardLens <onboarding@resend.dev>`. Set this to a verified sender on your own domain before sending real mail. |
| `CRON_SECRET` | Scheduled reminders | Without it `/api/cron/reminders` returns **503 and refuses to run**. |
| `AUTH_SECRET` | **Required in production — the code throws without it** | HMAC key for the session cookie and for hashing one-time login codes. Minimum 16 characters. Outside production a secret is generated once and written to `.awardlens-data/auth-secret`. |
| `ALLOW_LOCAL_STORE` | never | Suppresses the "production build on the ephemeral local store" warning. Set to `true` only to acknowledge an intentional demo deployment. It does not change behaviour. |
| `AWARDLENS_DATA_DIR` | never | Overrides the local store's root directory. Used by the integration tests. |
| `VERCEL` | set by the platform | When present, the local store root becomes `/tmp/awardlens-data` because serverless filesystems are read-only outside `/tmp`. |

### The four graded modes

`getServerConfig()` derives four **independent** modes. Each upgrades on its own
when its credentials appear; none of them depends on any other.

#### Storage — `supabase` | `local`

```
supabase  ⟸  NEXT_PUBLIC_SUPABASE_URL
          ∧  NEXT_PUBLIC_SUPABASE_ANON_KEY
          ∧  SUPABASE_SERVICE_ROLE_KEY      (all three)
local     ⟸  otherwise
```

* **`local` (default).** `src/lib/db/local.ts` — a single `db.json` plus a
  `documents/` directory under `.awardlens-data` (or `/tmp/awardlens-data` on
  Vercel, or `$AWARDLENS_DATA_DIR`). Writes are serialised through a promise
  queue and committed with a write-to-temp-then-rename. Organisation scoping is
  enforced inside every read helper, not only by callers. Document bytes are
  never written inside `public/`.
  **What it does not do:** survive a redeploy, survive a scale event, or share
  state between instances. On Vercel each lambda gets its own `/tmp`.
* **`supabase`.** Setting the three variables flips the reported mode — the UI
  and `describeConfig()` will say "Supabase Postgres". **It does not change
  where data goes.** No code path reads `config.supabase` yet. See
  [§8](#8-supabase-configuration).

A production build on `local` without `ALLOW_LOCAL_STORE=true` adds a config
warning that is rendered on the settings page.

#### AI — `live` | `fixtures`

```
live      ⟸  USE_DETERMINISTIC_AI_FIXTURES is falsey
          ∧  AI_GATEWAY_API_KEY is set
          ∧  AI_MODEL is set
fixtures  ⟸  otherwise
```

* **`fixtures` (default).** `src/lib/ai/fixtures.ts` runs a rule-based extractor
  over the document that was actually uploaded. See
  [§18](#18-deterministic-fixture-mode). "Ask this award" degrades to lexical
  retrieval and says so in the answer text rather than composing one.
* **`live`.** `generateObject` calls through `@ai-sdk/gateway` with the id in
  `AI_MODEL`. Structured output is validated by the Zod schemas in
  `src/lib/ai/schemas.ts`.

Asking for live mode without both credentials produces a warning and silently
stays on fixtures — it does not fail the request.

#### Billing — `stripe` | `development`

```
stripe       ⟸  STRIPE_SECRET_KEY ∧ STRIPE_WEBHOOK_SECRET
             ∧  DEVELOPMENT_BILLING_MODE is falsey
development  ⟸  otherwise
```

* **`development` (default outside production).** `startCheckoutAction` writes
  the entitlement straight to the subscription record and audits it as
  `billing.development_grant` with the note "Granted in development billing
  mode. No payment taken." In a **production** build this path refuses to run at
  all and returns "Development billing cannot grant plans in a production
  deployment."
* **`stripe`.** Stripe-hosted Checkout only; no card form is ever rendered by
  this application. The organisation id travels in `client_reference_id` and in
  metadata so the webhook can attribute payment without trusting the client.

A production build in `development` billing mode adds a loud config warning.

#### Email — `resend` | `console`

```
resend   ⟸  RESEND_API_KEY is set
console  ⟸  otherwise
```

* **`console` (default).** `sendEmail` logs
  `[email:console] to=jo***@example.org subject="…" (body suppressed)` and
  returns success. The recipient is partially redacted and **the body is never
  logged**, because it can contain obligation text drawn from a private award
  document.
* **`resend`.** Real delivery via the Resend SDK, from `EMAIL_FROM`.

**The consequence you must not miss:** in a production build,
`requestLoginCode` checks `isProduction && emailMode === "console"` and returns
an error instead of a code. The six-digit code is only ever returned to the
browser (`devCode`) outside production. So **a production deployment without
Resend cannot sign anyone in.** This is covered again in
[§15](#15-resend-setup) and [§27](#27-common-problems).

### Start from `.env.example`

`awardlens/.env.example` is an annotated template covering every variable, with
the graded-mode behaviour explained inline. Copy it rather than writing one from
scratch:

```bash
cd awardlens
cp .env.example .env.local
```

Note that the template ships with `USE_DETERMINISTIC_AI_FIXTURES=true` and
`DEVELOPMENT_BILLING_MODE=true` — the safe defaults. Both must be set to `false`
for live AI and real payments.

### A minimal `.env.local` for a fully configured local run

```bash
# .env.local  — awardlens/.env.local (git-ignored via `.env*`)
NEXT_PUBLIC_APP_URL=http://localhost:3000
AUTH_SECRET=replace-me-with-openssl-rand-base64-32

# Live AI (both required, plus turning fixtures off)
USE_DETERMINISTIC_AI_FIXTURES=false
AI_GATEWAY_API_KEY=...
AI_MODEL=<one id from `pnpm models:list`>

# Email
RESEND_API_KEY=re_...
EMAIL_FROM="AwardLens <awards@your-domain.org>"

# Billing (local testing)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_SINGLE_AWARD_PRICE_ID=price_...
STRIPE_SMALL_ORG_PRICE_ID=price_...
DEVELOPMENT_BILLING_MODE=false

# Reminders
CRON_SECRET=$(openssl rand -hex 32)
```

---

## 8. Supabase configuration

**Read this first.** `awardlens/supabase/` contains the complete production
schema — 16 tables, enums that mirror the TypeScript unions exactly, row-level
security on every table, and a private storage bucket with path-parsing
policies. It is good work and it is ready to apply.

**It is not connected to the application.** Grep confirms it:

```bash
cd awardlens
grep -rn 'from "@/lib/db' src | wc -l       # 15 — all of them "@/lib/db/local"
grep -rn '@supabase' src | wc -l            # 0
```

`@supabase/ssr` and `@supabase/supabase-js` are installed as dependencies and
imported nowhere. Setting the three Supabase variables changes what
`describeConfig()` reports and nothing else: your data still lands in the file
store.

### The seam, and what wiring it up actually involves

`src/lib/db/local.ts` documents itself as sitting "behind a narrow module seam
(`@/lib/db`)". As of this writing that seam is **nominal** — there is no
`src/lib/db/index.ts`, and all fifteen consumers import the concrete module
path. Making the swap real is a bounded piece of work:

1. **Extract the interface.** `local.ts` exports roughly 45 async functions.
   Define them as a `DbAdapter` type in a new `src/lib/db/types.ts`. The
   signatures are already storage-agnostic: they take and return the domain
   types in `src/lib/domain/types.ts` and every organisation-scoped read already
   takes `organizationId` as a parameter.
2. **Create `src/lib/db/index.ts`** that picks an implementation from
   `getServerConfig().storageMode` and re-exports it.
3. **Change the fifteen imports** from `@/lib/db/local` to `@/lib/db`. This is
   mechanical.
4. **Write `src/lib/db/supabase.ts`.** The main work is case mapping
   (`organizationId` ↔ `organization_id`) and choosing the right client per
   call: a request acting for a signed-in user must carry that user's token so
   RLS applies; only the Stripe webhook, the reminder cron, and organisation
   data deletion should use the service role.
5. **Move document bytes to Storage.** `saveDocumentBytes` currently returns
   `local://documents/<id>.bin`. The Supabase version must write to the
   `award-documents` bucket at exactly
   `organizations/{organizationId}/awards/{awardId}/{documentId}/{filename}` —
   the policies in `0003_storage.sql` parse the organisation id out of segment 2
   and will deny anything else. Reads should go through signed URLs; browsers
   never touch the bucket directly.
6. **Replace the login-code table.** `supabase/README.md` states plainly that
   the one-time login codes have no table in the schema because production is
   expected to use Supabase Auth (OTP / magic link), with `auth.users` and
   GoTrue owning that flow. Either add a table or migrate `src/lib/auth` to
   Supabase Auth. This is the largest single decision in the migration.
7. **Run the negative test suite** in `supabase/README.md` before and after.

Until steps 1–6 are done, treat `storageMode = "supabase"` as a label, not a
behaviour.

### Creating the project

```bash
# Hosted
# 1. Create a project at https://supabase.com/dashboard
# 2. Settings → API: copy Project URL, anon public key, service_role key

# Local
brew install supabase/tap/supabase   # or see supabase.com/docs for your platform
cd awardlens
supabase start                        # Postgres, Auth, Storage, Studio, mail catcher
```

Local endpoints once `supabase start` is up (from `supabase/README.md`):

| What | Where |
| --- | --- |
| Studio | <http://localhost:54323> |
| Postgres | `postgresql://postgres:postgres@localhost:54322/postgres` |
| Mail catcher (login codes) | <http://localhost:54324> |

---

## 9. Database migrations

Migrations are ordinary SQL applied in filename order. Every one is written to
be re-runnable: `create table if not exists`, guarded `create type`, and
`drop policy if exists` before every `create policy`.

```
supabase/migrations/
  0001_initial_schema.sql       617 lines — tables, enums, indexes, updated_at triggers
  0002_row_level_security.sql   752 lines — the security-critical file
  0003_storage.sql              145 lines — private bucket + object policies
supabase/seed.sql               277 lines — guarded demo dataset
```

### Applying locally

```bash
cd awardlens
supabase db reset      # drops, re-applies every migration, then runs seed.sql
```

Use `supabase db reset` as your working loop while changing the schema. It
proves the migrations work from nothing every time; editing the database by hand
does not.

### Applying to a hosted project

```bash
cd awardlens
supabase login
supabase link --project-ref <your-project-ref>

supabase migration list      # local vs remote migration state
supabase db diff --linked    # drift between this directory and the remote
supabase db push             # apply anything the remote has not seen
```

**Do not run `seed.sql` against a project with real data.** It is guarded — it
does nothing when any organisation already exists — but it is a demo fixture,
not a fixup script.

### Verifying RLS after every schema change

`supabase/README.md` documents a fix that a negative test actually found during
development: an earlier draft of the membership policy allowed a user to insert
themselves into another organisation as `owner`. That test is item 12 in the
suite at the end of `0002_row_level_security.sql` and it must stay there.

Run all three of these. All three should return nothing:

```sql
-- 1. Any table in public without row-level security enabled.
select tablename
from pg_tables
where schemaname = 'public'
  and rowsecurity = false;

-- 2. Any table with RLS enabled but no policies. processed_stripe_events is the
--    one expected row here: it is service-role only, by design.
select c.relname
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity
  and not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname
  );

-- 3. Any security definer function in public with a mutable search_path.
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and not exists (
    select 1 from unnest(coalesce(p.proconfig, '{}')) c
    where c like 'search_path=%'
  );
```

Run the negative tests as a role, not as `postgres` — `postgres` owns the tables
and is not subject to the policies, which produces a comfortable false pass:

```sql
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"<USER_UUID>","role":"authenticated"}';
  -- … the 14 checks from supabase/README.md …
rollback;
```

### Two structural decisions in the schema

* **`organization_id` is denormalised onto every organisation-owned table**,
  including `documents`, `obligations`, `reminders`, `exports`, `ask_exchanges`
  and `processing_runs`, even where it is derivable through a parent. This
  exists so an RLS policy can authorise with one indexed predicate
  (`public.is_org_member(organization_id)`) instead of a join. Every insert into
  those tables must set it.
* **`document_segments` and `obligation_citations` deliberately have no
  `organization_id`.** They are authorised with an `exists` check against their
  parent. If you add a table under `documents` or `obligations`, follow the same
  pattern or add the column — do not leave it unpoliced.

---

## 10. Storage bucket

`0003_storage.sql` creates one **private** bucket, `award-documents`, with a
15 MB file size limit and exactly four allowed MIME types:

```
application/pdf
application/vnd.openxmlformats-officedocument.wordprocessingml.document
text/plain
text/markdown
```

Those limits are a deliberate duplicate of `MAX_UPLOAD_BYTES` and
`ACCEPTED_MIME_TYPES` in `src/lib/documents/validation.ts`. They are repeated at
the storage layer because the storage API can be called without going through
the application.

Object paths **must** be:

```
organizations/{organizationId}/awards/{awardId}/{documentId}/{filename}
```

The policies parse the organisation id out of segment 2 and check membership.
A path that does not match resolves to `null` and is denied — the UUID cast is
guarded, so a hostile object name produces a policy denial, not an
`invalid input syntax for type uuid` error.

There is **no update policy**: documents are immutable once written. A corrected
file is a new `documents` row and a new object, so the bytes a citation points
at cannot change after review. Browsers never read the bucket directly; the
server issues signed URLs.

If you change the bucket name, set `SUPABASE_STORAGE_BUCKET` to match.

Today the application writes bytes to the local filesystem
(`db.saveDocumentBytes`), so none of this is exercised yet.

---

## 11. AI Gateway configuration

AwardLens talks to models exclusively through the **Vercel AI Gateway** via
`@ai-sdk/gateway`. `src/lib/ai/model.ts` is the only place a model client is
constructed:

```ts
function gatewayProvider() {
  const { ai } = getServerConfig();
  if (!ai.apiKey) throw new ModelNotConfiguredError();
  return createGateway({ apiKey: ai.apiKey });
}
```

Switching providers is a configuration change, not a code change — nothing in
the codebase names a provider or a model.

### Creating a key

1. Go to the Vercel dashboard → **AI Gateway**.
2. Create an API key.
3. Set it as `AI_GATEWAY_API_KEY` locally and in every Vercel environment that
   should call a model.

### Turning live mode on

Two things are required, and they are separate:

```bash
AI_GATEWAY_API_KEY=...
AI_MODEL=<id from `pnpm models:list`>
USE_DETERMINISTIC_AI_FIXTURES=false     # ← easy to forget; defaults to true
```

Omit any one of them and `getServerConfig()` stays in `fixtures` mode. If you
set `USE_DETERMINISTIC_AI_FIXTURES=false` but not the credentials, you get this
warning on the settings page rather than a broken request:

> Live AI was requested but AI_GATEWAY_API_KEY and AI_MODEL are not both set.
> Falling back to deterministic fixtures. Run `pnpm models:list` to see model
> IDs available to your gateway key.

### Cost controls that are already in the code

* `MAX_SEGMENTS_PER_RUN = 60` — a longer document is truncated and the user is
  warned in plain language that later sections were not read.
* `MAX_BATCH_CHARS = 11_000`, `MAX_BATCH_SEGMENTS = 6` — obligation extraction
  is batched.
* The profile pass sees only the first 6 segments; the critic sees the first 24.
* `maxRetries: 2` on extraction calls, `1` on the critic.
* Rate limits in `src/lib/security/rate-limit.ts`: 12 uploads/hour,
  20 extractions/hour, 40 asks/hour, per organisation. These are **per process**
  — see [§25](#25-monitoring).
* Token usage per stage is recorded on every `processing_runs` row
  (`usageMetadata`), so spend is attributable.

---

## 12. Model selection

**The model id is never hardcoded.** `AI_MODEL` is required for live mode, and
`scripts/list-models.mjs` exists so you set it to an id your key can verifiably
reach — rather than one that existed when this code was written.

```bash
cd awardlens
AI_GATEWAY_API_KEY=your_key pnpm models:list
```

Or, with the key already in your environment:

```bash
pnpm models:list
```

Output looks like:

```
23 language models available:

  provider/model-id — Human Readable Name
  provider/other-model — Another Name
  …

Set one of these as AI_MODEL in your environment, for example:
  AI_MODEL=provider/model-id
```

The script calls `gateway.getAvailableModels()` and filters to entries whose
`modelType` is `language` or absent. If the key is missing it exits 1 with
instructions. If the gateway rejects the key or is unreachable it exits 1 and
tells you to check the key and the network.

Pick an id, put it in `AI_MODEL`, and — if you want a second opinion pass on a
different model — put another id in `AI_CRITIC_MODEL`. `getCriticModel()` falls
back to `AI_MODEL` when the critic model is unset. The rationale in the code is
that the reviewer should not necessarily be the same system that produced the
claim.

Re-run `pnpm models:list` whenever a model is deprecated. Because nothing is
hardcoded, changing models is a Vercel environment-variable edit and a redeploy
— no code change, no rebuild of prompts.

---

## 13. Stripe setup

Billing is entirely Stripe-hosted Checkout. `src/lib/billing/stripe.ts` never
renders a card form; card data does not touch this application.

### Plans

Defined in `src/lib/billing/plans.ts`:

| Plan id | Name | Price | Award limit | Reminders | Stripe mode |
| --- | --- | --- | --- | --- | --- |
| `demo` | Free | $0 | 1 | No | — |
| `single_award` | Single Award Pack | $29 one time | 2 | Yes | `payment` |
| `small_org` | Small Organisation | $29/month | 12 | Yes | `subscription` |
| `team` | Team | $79/month | 50 | Yes | `subscription` |

Single-award packs add **credits** rather than raising a tier:
`checkAwardEntitlement` computes the effective limit as
`plan.awardLimit + subscription.awardCredits`, so buying two packs gives two
extra awards without modelling a second subscription.

The Team plan's "shared organisation workspace" is not implemented. Do not sell
it until it is.

### Steps

1. Create a Stripe account and stay in **test mode** until you have run the
   whole flow end to end.
2. Create three prices:
   * a one-time price for **Single Award Pack**,
   * a recurring monthly price for **Small Organisation**,
   * a recurring monthly price for **Team**.
3. Copy the price ids (`price_…`) into
   `STRIPE_SINGLE_AWARD_PRICE_ID`, `STRIPE_SMALL_ORG_PRICE_ID`,
   `STRIPE_TEAM_PRICE_ID`.
4. Copy your secret key into `STRIPE_SECRET_KEY`.
5. Set `DEVELOPMENT_BILLING_MODE=false`.
6. Set the webhook secret — see [§14](#14-stripe-webhooks).

If a price id is missing for a plan the user selects, `createCheckoutSession`
throws with the message "No Stripe price is configured for the *N* plan. Set the
matching `STRIPE_*_PRICE_ID`." The user sees a generic "We could not start
checkout just now"; the specific reason is in the server log.

The Stripe SDK's API version is deliberately **not pinned** in code — the
installed SDK's default version is the one its types were generated against, and
letting it choose avoids a silent mismatch.

---

## 14. Stripe webhooks

`/api/webhooks/stripe` handles four event types:

| Event | Effect |
| --- | --- |
| `checkout.session.completed` | Activates the plan. `mode: "payment"` adds one award credit instead of changing the recurring tier. |
| `customer.subscription.created` / `.updated` | Upserts plan, status and period end. |
| `customer.subscription.deleted` | Drops to the free `demo` tier with status `canceled` — history and purchased one-off credits survive. |
| `invoice.payment_failed` | Sets status `past_due`. |

Two non-negotiables are enforced in the handler:

* **The signature is verified against the raw body before anything is read.**
  `await request.text()` first; parsing the body first would break verification.
  An unverified webhook is an unauthenticated request that grants paid access.
* **Every event id is claimed exactly once** (`db.claimStripeEvent`). Stripe's
  at-least-once delivery and its retries cannot double-apply an entitlement. A
  duplicate returns `{ received: true, duplicate: true }` so Stripe stops
  retrying. A handler failure returns 500 so Stripe retries — and because the id
  is already claimed the retry is a no-op, which is the safe direction.

Billing audit events record the plan and mode only — never amounts, card details
or customer email.

### Local webhook testing

```bash
# Terminal 1
cd awardlens && pnpm dev

# Terminal 2
stripe login
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

`stripe listen` prints a signing secret (`whsec_…`). Put it in
`awardlens/.env.local` as `STRIPE_WEBHOOK_SECRET` and restart `pnpm dev` — the
config is memoised per process, so a change requires a restart.

Then drive a real checkout from `/app/settings`, or trigger events directly:

```bash
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted
stripe trigger invoice.payment_failed
```

Note that `stripe trigger` fixtures carry no `client_reference_id` or
`organizationId` metadata, so the handler will return early without changing
anything. To test attribution you must go through a real Checkout session
started from the application, which sets both.

### Production webhook

1. Stripe Dashboard → Developers → Webhooks → **Add endpoint**.
2. URL: `https://your-domain/api/webhooks/stripe`
3. Events: the four listed above.
4. Copy the signing secret into `STRIPE_WEBHOOK_SECRET` in Vercel and redeploy.

If Stripe is not configured the route returns 503 with `Stripe is not
configured` rather than silently accepting the request.

---

## 15. Resend setup

**This is the section most likely to cost you a launch.**

`emailMode` is `resend` when `RESEND_API_KEY` is set and `console` otherwise.
In `console` mode `sendEmail` logs a redacted recipient and the subject, and
suppresses the body — obligation text is private award content and does not
belong in a log.

Now the consequence. In `src/app/actions/auth.ts`:

```ts
if (config.isProduction && config.emailMode === "console") {
  return {
    status: "error",
    email,
    message:
      "Email delivery is not configured on this deployment, so sign-in codes cannot be sent. Set RESEND_API_KEY and EMAIL_FROM.",
  };
}
```

and the code is only ever returned to the browser outside production:

```ts
devCode: config.isProduction ? undefined : code,
```

> **A production deployment without Resend cannot sign anyone in.** There is no
> fallback, no admin bypass, and no way to read the code. Configure Resend
> before you invite a single pilot user.

### Steps

1. Create a Resend account.
2. Add and verify your sending domain (DNS records: SPF, DKIM, and a return-path
   record — Resend walks you through it).
3. Create an API key. Set `RESEND_API_KEY`.
4. Set `EMAIL_FROM` to a verified sender on that domain, e.g.
   `EMAIL_FROM="AwardLens <awards@your-domain.org>"`.

The default `AwardLens <onboarding@resend.dev>` is Resend's shared testing
sender. It works for a quick check but is unsuitable for real users.

### What gets sent

Only two message types exist:

* **Sign-in code** — six digits, expires in 15 minutes, plus the line "AwardLens
  will never ask you for this code by phone or email reply."
* **Deadline reminder** — obligation title, award name, due date, days
  remaining, suggested start date and owner role, and a deep link back into the
  app. **Source excerpts are deliberately kept out of email** — they are award
  content.

---

## 16. Scheduled reminders

### How reminders are scheduled

`syncRemindersForObligation` in `src/lib/reminders/index.ts` only schedules when
**all** of these hold:

* the obligation's `reviewStatus === "confirmed"` — a person has verified it,
* it has a `dueDate`,
* the organisation's plan includes reminders (`canUseReminders`),
* the user's notification preferences are enabled and have at least one offset.

Offsets come from `REMINDER_OFFSETS = [90, 60, 30, 14, 7, 1]`; the default
preference is `[30, 14, 7, 1]`. Any offset whose scheduled date is already in the
past is dropped rather than fired immediately.

The idempotency key is `obligationId:dueDate:offsetDays:userId`. Re-running the
scheduler is a no-op, and changing a due date retires the old schedule instead
of duplicating it. Already-sent reminders are never replaced — a sent reminder
is a historical fact.

### How reminders are sent

`GET`/`POST /api/cron/reminders` calls `processDueReminders()`. Each due
reminder is **re-validated against live data** before sending: if the obligation
was deleted, un-confirmed, or re-dated since scheduling, the reminder is
cancelled instead of sent. A send failure leaves the reminder in `scheduled` with
`lastError` recorded, so the next run retries.

### CRON_SECRET is mandatory

```ts
if (!config.cronSecret) {
  return NextResponse.json({ ok: false, error: "CRON_SECRET is not configured, …" }, { status: 503 });
}
if (!authorised(request, config.cronSecret)) {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}
```

Without `CRON_SECRET` the endpoint **refuses to run at all**. The rationale in
the code: an unauthenticated job that can send email to your users is worse than
a job that does not run. Authorisation is a constant-time comparison of the
`Authorization: Bearer <secret>` header.

Generate one:

```bash
openssl rand -hex 32
```

### `vercel.json`

Vercel Cron will not run without a cron definition in `vercel.json`, and that
file must sit at **`awardlens/vercel.json`** — the project root as Vercel sees
it, because Root Directory is set to `awardlens` ([§22](#22-vercel-deployment)).

The repository contains it. This is the cron entry, exactly as committed:

```json
{
  "crons": [
    {
      "path": "/api/cron/reminders",
      "schedule": "0 13 * * *"
    }
  ]
}
```

`0 13 * * *` is 13:00 UTC daily — roughly 8am US Central in winter. Vercel Cron
schedules are always interpreted in UTC. Change it if your users are elsewhere.

The committed file also sets security headers, which is worth knowing about
because it is the only place they are configured (`next.config.ts` is empty):

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "X-Frame-Options", "value": "DENY" },
        {
          "key": "Permissions-Policy",
          "value": "camera=(), microphone=(), geolocation=(), interest-cohort=()"
        }
      ]
    },
    {
      "source": "/api/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "no-store" }]
    }
  ]
}
```

These headers are applied by Vercel, not by Next.js, so they are absent when you
run `pnpm start` locally. Do not treat a local check as evidence they are set.

Vercel automatically sends `Authorization: Bearer $CRON_SECRET` to cron
invocations, which is exactly what the route checks. Set `CRON_SECRET` in the
Vercel project's environment variables and redeploy after adding `vercel.json`
— cron definitions are read at deploy time.

### Testing it by hand

```bash
curl -i -H "Authorization: Bearer $CRON_SECRET" \
  https://your-domain/api/cron/reminders
```

Expect `{"ok":true,"considered":N,"sent":N,"skipped":N,"failed":N}`.
`503` means `CRON_SECRET` is unset on the server. `401` means the secret you
sent does not match.

---

## 17. Local development

```bash
cd awardlens
pnpm install
pnpm dev            # http://localhost:3000
```

`.awardlens-data/` holds `db.json` (every award, obligation and uploaded
document's parsed text), `documents/*.bin` (the raw uploaded bytes), and
`auth-secret` (the generated development session key). None of that belongs in
version control, and `.gitignore` covers it — along with `.env*`. Check both are
still there if you edit `.gitignore`.

### The development loop

* **Sign in.** Go to `/auth/sign-in`, enter any email. The six-digit code is
  shown on screen under a "Development mode — email is not being sent" notice.
  Enter it. A profile and a single organisation are created on the spot.
* **Upload.** `/app/awards/new` accepts a `.pdf`, `.docx`, `.txt` or `.md` file,
  pasted text, or the built-in sample document. Progress is streamed as real
  stage transitions.
* **Review.** `/app/awards/[awardId]/review` is the confirm-or-correct
  workspace; `/obligations` is the register; `/plan` is the printable operating
  plan; `/ask` is per-award Q&A.
* **Reset your local data** at any time:

  ```bash
  rm -rf awardlens/.awardlens-data
  ```

* **Config changes need a restart.** `getServerConfig()` memoises into a
  module-level `cached` variable. Editing `.env.local` does not take effect
  until you restart `pnpm dev`.

### Available scripts

```bash
pnpm dev          # next dev
pnpm build        # next build
pnpm start        # next start (requires a prior build)
pnpm lint         # eslint
pnpm typecheck    # tsc --noEmit
pnpm verify       # typecheck && lint && test && build
```

### A note on the framework

`awardlens/AGENTS.md` says: "This is NOT the Next.js you know. This version has
breaking changes — APIs, conventions, and file structure may all differ from
your training data. Read the relevant guide in `node_modules/next/dist/docs/`
before writing any code." Take it seriously — this is Next.js 16.2.12 with
React 19. Patterns you remember from Next 13/14 may not apply.

Concretely, in this codebase: `cookies()` and `headers()` are async and must be
awaited; route handler `context.params` is a `Promise` and is destructured with
`await context.params`; and there is no `middleware.ts` — authentication is
enforced in the `(app)` route group's layout via `requireSession()`, deliberately
"on the server that renders the data".

---

## 18. Deterministic fixture mode

This is the default mode and it deserves a section, because it is not what
"fixtures" usually means.

**It is not a canned response.** `src/lib/ai/fixtures.ts` is a rule-based
extractor that reads the document the user actually uploaded:

* `splitSentences` breaks each stored segment into sentences.
* 21 ordered `ObligationRule` entries — most specific first — match sentences by
  regular expression. `prior-approval`, `match`, `final-report`, `closeout`,
  `audit`, `retention`, `branding`, `restricted`, `indirect`,
  `budget-revision`, `subrecipient`, `procurement`, `insurance`,
  `eligibility`, `performance`, `data`, `reporting`, `renewal`, `deliverable`,
  `financial-mgmt`, `compliance`.
* Boilerplate (`whereas`, `now therefore`, signature blocks) and pure
  definitions are excluded.
* Each rule carries a category, priority, suggested owner role, lead days and a
  base confidence. Confidence drops by 0.18 when the sentence lacks
  `shall`/`must`/`is required to`, and `interpretationLevel` becomes
  `light_interpretation` instead of `explicit`.
* Dates are found with `findDatesInText` (fully specified dates only — a bare
  year or a month-and-year cannot become a deadline). A sentence with a
  recurrence keyword gets **no** normalized due date, because a recurring duty
  has no single calendar date until a human anchors it.
* **The excerpt is the real sentence**, sliced to 590 characters, cited against
  the real `segmentId`.

`deterministicProfile` does the same for award identity: funder, recipient,
award number, amount (largest figure appearing near award language), grant
period, governing documents (`\d+ CFR Part \d+`, `Exhibit A`, `Attachment 1`,
`Grantee Handbook`), and CFDA / assistance listing number. It also sets
`isGrantDocument` by counting grant-language signals — fewer than six and the
document is flagged as probably not a grant.

**Why this matters:** because the excerpts are genuine sentences from the
document, they pass through `resolveCitations` exactly as a model's would. The
citation-validation path is *exercised*, not bypassed. That is why CI is
meaningful and why `/demo` shows real output rather than a mock-up.

The honest trade, stated in the module's own comment: it is more literal and
less complete than a model. Recall on unusual wording is lower. That is the
price of determinism.

### Running it

Fixture mode is the default — you do not have to do anything. To force it even
with credentials present:

```bash
USE_DETERMINISTIC_AI_FIXTURES=true pnpm dev
```

### "Ask this award" in fixture mode

`askAward` runs lexical retrieval over the award's own segments (term overlap
plus a phrase bonus — no embeddings, no vector store) and then, with no model
available, **says so**:

> No AI model is configured, so AwardLens cannot compose an answer. These are the
> passages in this award that most closely match your question — read them and
> judge for yourself.

followed by the matching passages with their locators. It does not fabricate an
answer and it does not pretend a model ran.

---

## 19. Test commands

These are the real script names from `awardlens/package.json`.

| Command | What it runs | Notes |
| --- | --- | --- |
| `pnpm test` | `vitest run` — everything matched by `vitest.config.ts` (`tests/unit/**` and `tests/integration/**`) | The default. No network, no credentials. |
| `pnpm test:watch` | `vitest` | |
| `pnpm test:unit` | `vitest run tests/unit` | 13 files, pure logic |
| `pnpm test:integration` | `vitest run tests/integration` | `pipeline.test.ts` and `extraction-eval.test.ts` |
| `pnpm test:ai-fixtures` | `vitest run tests/integration/extraction-eval.test.ts` | The extraction evaluation, deterministic mode. Offline and free. |
| `pnpm test:ai-live` | `AWARDLENS_LIVE_EVAL=1 vitest run tests/integration/extraction-eval.test.ts` | The same evaluation against a live model. See [§20](#20-live-ai-evaluation). |
| `pnpm test:e2e` | `playwright test` | Boots `pnpm dev` itself via `webServer`. Needs a Chromium build. |
| `pnpm test:accessibility` | `playwright test tests/e2e/accessibility.spec.ts` | ⚠️ **No target as of this writing** — that spec file does not exist. `@axe-core/playwright` is installed and waiting for it. |
| `pnpm typecheck` | `tsc --noEmit` | |
| `pnpm lint` | `eslint` | |
| `pnpm verify` | `typecheck && lint && test && build` | Run before every deploy. Note it does **not** include Playwright. |

Two things worth knowing about the Playwright setup, both documented in
`playwright.config.ts` and both load-bearing:

* **The e2e suite runs against `next dev`, not `next start`.** Sign-in is a
  six-digit code that is only returned to the browser when
  `NODE_ENV !== "production"`. A production build with no Resend key cannot be
  signed into by a test any more than by a person, so it could not exercise a
  single authenticated screen. This is the same constraint described in
  [§15](#15-resend-setup), showing up in the test harness.
* **It is serial — `fullyParallel: false`, one worker.** The file-backed store
  is shared mutable state; two workers would interleave writes to the same JSON
  file and make every "did my change persist?" assertion meaningless. The suite
  points `AWARDLENS_DATA_DIR` at a fresh temp directory per run, so it never
  touches your own development data, and it forces
  `USE_DETERMINISTIC_AI_FIXTURES=true` so extraction is offline and identical
  every run.

### What the tests actually cover

`tests/unit/` — 11 files, all pure logic, no network, no mocks of the modules
under test:

| File | Covers |
| --- | --- |
| `citations.test.ts` | `normaliseWithMap`, `matchExcerpt`, `resolveCitations`, `summariseCoverage` — the anti-fabrication invariant |
| `consolidate.test.ts` | `tokenSet`, `similarity`, `isSameObligation`, `consolidateCandidates` including date conflicts |
| `dates.test.ts` | `findDatesInText`, `checkDuePlausibility`, `defaultLeadDays`, `computeInternalDueDate`, `classifyRecurrence`, `expandRecurrence` |
| `exports-csv.test.ts` | RFC 4180 quoting and spreadsheet formula neutralisation |
| `exports-ics.test.ts` | RFC 5545 escaping and 75-octet line folding |
| `fixtures-extractor.test.ts` | The deterministic extractor against the real fixture documents, including that its citations resolve |
| `parse.test.ts` | Plain-text parsing, page markers, running header/footer stripping |
| `pipeline.test.ts` | `batchSegments`, `detectInjectionAttempts` |
| `plans.test.ts` | `planFor`, `checkAwardEntitlement`, `canUseReminders` |
| `rate-limit.test.ts` | Fixed-window behaviour against a fixed clock |
| `segment.test.ts` | Segment sizing, locator ranges, `formatLocator` |
| `validation.test.ts` | Upload validation, size and type rejection, content hashing |

`tests/integration/pipeline.test.ts` — 439 lines running the **real** ingestion
path against the **real** file store in a temp directory
(`AWARDLENS_DATA_DIR` is pointed at `mkdtemp`), with
`USE_DETERMINISTIC_AI_FIXTURES=true`. It covers ingest, dedupe, workspace and
dashboard queries, all three exports, and reminder scheduling and delivery. No
mocks of the modules under test.

`tests/fixtures/` — 12 synthetic award documents plus a `manifest.json` that
declares, per fixture, the expected award identity and the critical obligations
with the exact source text each must cite. The fixtures are deliberately
adversarial:

```
01-simple-foundation-grant        happy path
02-government-quarterly-reports   recurring reporting
03-cost-share-match               match / cost-share
04-prior-approval-budget          prior approval triggers
05-conflicting-dates              two stated due dates for one requirement
06-incorporated-policies          requirements incorporated by reference
07-missing-final-report-date      a report with no stated deadline
08-repeated-headers-footers       running header/footer stripping
09-prompt-injection               text engineered to address the model
10-non-grant-document             should set isGrantDocument = false
11-empty-scanned                  no usable text layer
12-no-financial-restrictions      absence of a category should not be invented
```

Every funder, recipient, person, address and award number in them is fictional.

### `server-only` under test

Several modules `import "server-only"`, whose real entrypoint throws outside a
React Server Component graph. `vitest.config.ts` aliases it to
`tests/unit/_stubs/server-only.ts` so those modules can be imported and their
pure logic exercised. Nothing else about module resolution changes.

---

## 20. Live AI evaluation

The `pnpm test:ai-fixtures` and `pnpm test:ai-live` scripts point at
`tests/integration/extraction-eval.test.ts`, **which does not exist yet**. What
follows is how to evaluate live extraction today, plus what building the missing
harness would involve.

### Evaluating live extraction by hand

1. Configure live mode ([§11](#11-ai-gateway-configuration)) in
   `awardlens/.env.local`.
2. Restart `pnpm dev`.
3. Confirm the mode banner is gone and `/app/settings` shows
   `Live model (<your model id>)`.
4. Upload each fixture in `tests/fixtures/` through `/app/awards/new` using the
   "paste text" option.
5. Compare the result against `tests/fixtures/manifest.json`, which declares for
   each fixture:
   * `expectedAward` — funder, recipient, award number, amount, currency, start
     and end dates,
   * `expectedCriticalObligations` — a `key`, a `category`, `titleContains`
     tokens, an `expectedDueDate`, and `mustCiteTextContaining`, which is the
     literal source string the citation has to include.

The fixtures worth the most attention:

* **05-conflicting-dates.** The merged obligation must have `dueDate: null`,
  two `dateConflicts` entries, and a clarification question naming both dates.
  Any single winner is a bug.
* **07-missing-final-report-date.** The obligation must exist with a null due
  date and a clarification question, not an invented deadline.
* **09-prompt-injection.** The instruction-like passages must be reported back
  to the user as ignored (`injectionAttempts`) and must not have changed the
  output. Check the warning banner on the award page.
* **10-non-grant-document.** `isGrantDocument` must be false and the warning
  must be shown.
* **11-empty-scanned.** Ingestion must fail cleanly with `no_text` and the
  "paste the text instead" message — no model call should happen at all,
  because parsing precedes extraction.

### Metrics the pipeline already computes for you

Every run persists a `processing_runs` row and returns an `ExtractionResult`
carrying:

* `coverage` — `{ total, verified, partial, unverified, coverage }` from
  `summariseCoverage`. `coverage` is the share of obligations whose evidence was
  found verbatim.
* `droppedUnsupported` — how many proposed items could not be traced to text in
  the document and were discarded.
* `injectionAttempts` — instruction-like passages found and ignored.
* `usage` — input/output/total tokens and per-stage duration and call counts.
* `warnings` — plain-language problems shown to the user.

A useful acceptance bar for a live model: **`droppedUnsupported` should be at or
near zero on the fixtures.** A model that regularly produces quotes not present
in the document is not fit for this product, regardless of how good the prose
is.

### Building the missing harness

To make `pnpm test:ai-fixtures` and `pnpm test:ai-live` real, create
`tests/integration/extraction-eval.test.ts` that:

1. Loads `tests/fixtures/manifest.json`.
2. For each fixture, parses and segments the text, then calls `runExtraction`
   with `forceMode` set to `"fixtures"` or `"live"` — the `PipelineOptions`
   already expose `forceMode` precisely so evaluations can override the
   configured mode.
3. Picks the mode from `process.env.AWARDLENS_LIVE_EVAL === "1"`.
4. Asserts the manifest's expectations, and skips the whole suite when live mode
   is requested but `AI_GATEWAY_API_KEY`/`AI_MODEL` are absent — a live eval must
   never fail CI for a missing key.

---

## 21. Production build

```bash
cd awardlens
pnpm verify        # typecheck, lint, test, build — run this before every deploy
```

Or the build alone:

```bash
pnpm build
pnpm start         # serves the production build on :3000
```

### Things to know about the build

* `/demo` is `export const dynamic = "force-static"` and runs the **real**
  pipeline over the sample award at build time. If the deterministic extractor
  ever throws on the sample, the build fails. That is intentional — it is a
  build-time smoke test of the pipeline.
* All four route handlers declare `runtime = "nodejs"`. PDF parsing (`unpdf`),
  DOCX parsing (`mammoth`), `node:crypto` and the AI SDK all need Node APIs;
  these routes must not run on Edge. Do not change this.
* `/api/awards/ingest` and `/api/cron/reminders` declare `maxDuration = 300`.
  Confirm your Vercel plan permits a 300-second function; on Hobby the ceiling
  is lower and a long extraction will be cut off mid-stream.
* `NEXT_PUBLIC_*` variables are inlined at build time. Changing
  `NEXT_PUBLIC_APP_URL` requires a **redeploy**, not just an environment edit.
* `next.config.ts` is empty. There is no basePath, no custom output mode, no
  image loader configuration. The app expects to be served from the root of its
  own domain.

### Production preflight

```bash
# 1. Everything green
pnpm verify

# 2. AUTH_SECRET is set and at least 16 characters — the app throws without it
test ${#AUTH_SECRET} -ge 16 && echo "AUTH_SECRET ok"

# 3. A production-like run locally
NODE_ENV=production pnpm build && NODE_ENV=production pnpm start
```

Then open `/app/settings` and read the configuration panel. Any warning listed
there is a real problem `getServerConfig()` wants you to see before customers do.

---

## 22. Vercel deployment

### ⚠️ Root Directory — read this before anything else

**The Vercel project's Root Directory must be set to `awardlens`.**

The repository root is a static HTML site. It has no `package.json`, no
`next.config.ts` and no `src/`. If you import this repository into Vercel and
accept the default Root Directory of `.`, the build will either fail with "no
framework detected" or deploy the static site instead of the application. This
is the single most likely deployment mistake with this repository.

Set it during import, or afterwards at
**Project → Settings → General → Root Directory → `awardlens`**.

With Root Directory set to `awardlens`, every other path Vercel cares about is
relative to that directory — including `vercel.json`, which therefore lives at
`awardlens/vercel.json`.

### Import

1. Vercel → **Add New… → Project** → import the Git repository.
2. **Root Directory: `awardlens`.** ← the thing above.
3. Framework preset: Next.js (detected automatically once the root is right).
4. Build command: leave as default (`pnpm build`).
5. Install command: leave as default (`pnpm install`).
6. Node.js version: 20.x or 22.x. This build was verified on Node 22.22.2.

### Environment variables

Set these in **Project → Settings → Environment Variables**, for the
environments you want them in.

Minimum for a deployment that anyone can actually sign in to:

```
AUTH_SECRET               = <openssl rand -base64 32>
NEXT_PUBLIC_APP_URL       = https://your-domain
RESEND_API_KEY            = re_...
EMAIL_FROM                = AwardLens <awards@your-domain>
```

For real extraction:

```
AI_GATEWAY_API_KEY               = ...
AI_MODEL                         = <from `pnpm models:list`>
USE_DETERMINISTIC_AI_FIXTURES    = false
```

For reminders:

```
CRON_SECRET               = <openssl rand -hex 32>
```
plus `awardlens/vercel.json` from [§16](#16-scheduled-reminders).

For payments:

```
STRIPE_SECRET_KEY             = sk_live_...
STRIPE_WEBHOOK_SECRET         = whsec_...
STRIPE_SINGLE_AWARD_PRICE_ID  = price_...
STRIPE_SMALL_ORG_PRICE_ID     = price_...
DEVELOPMENT_BILLING_MODE      = false
```

For a knowingly-ephemeral demo deployment, to acknowledge the local store:

```
ALLOW_LOCAL_STORE         = true
```

### What you are deploying on the local store

Be explicit with yourself about this. On Vercel, with `storageMode = "local"`:

* the data directory is `/tmp/awardlens-data`,
* it is **per lambda instance**, so two concurrent users can land on different
  instances and see different data,
* it is **wiped on every redeploy** and whenever an instance is recycled,
* sessions survive because they are HMAC-signed cookies, but the profile they
  point at may no longer exist, which reads as being silently signed out.

That is acceptable for a demo and unacceptable for customers. `getServerConfig()`
raises a warning for exactly this case unless you set `ALLOW_LOCAL_STORE=true`.

### The static site is unaffected

Deploying `awardlens/` to Vercel does not touch the GitHub Pages workflow in
`.github/workflows/`, which builds and publishes the repository root. The two
deployments are independent and neither knows about the other.

---

## 23. Custom domain

1. Vercel → Project → **Settings → Domains → Add**.
2. Enter your domain or subdomain (e.g. `awardlens.example.org`).
3. Add the DNS records Vercel shows you — a `CNAME` to
   `cname.vercel-dns.com` for a subdomain, or the `A` record it specifies for an
   apex domain.
4. Wait for the certificate to issue (usually a few minutes).
5. **Update `NEXT_PUBLIC_APP_URL` to the final `https://…` origin and redeploy.**
   This is not optional: the value is inlined at build time and is used for
   reminder email deep links, Stripe success and cancel URLs, ICS export links
   and Open Graph `metadataBase`. A stale value sends your users to the wrong
   host.
6. **Update the Stripe webhook endpoint URL** to the new domain
   ([§14](#14-stripe-webhooks)).
7. If you use a separate sending domain for Resend, verify it independently —
   the app domain and the email domain do not have to match, but the
   `EMAIL_FROM` address must be on a verified Resend domain.

Session cookies are set with `secure: true` when `NODE_ENV === "production"`, so
the production deployment must be served over HTTPS or sign-in will silently
fail to persist.

---

## 24. Post-deployment smoke tests

Run all of these against the deployed URL, in order, before letting a real user
in. Each one exercises something the code actually does.

1. **`/` loads** and shows the marketing page with plan cards.
2. **`/pricing` loads** and lists Free, Single Award Pack, Small Organisation and
   Team with the prices from `src/lib/billing/plans.ts`.
3. **`/demo` loads** and shows real extracted obligations with citations. This
   page is statically built from the real pipeline, so if it renders, the
   deterministic extractor and citation resolver survived the build.
4. **`/app` while signed out redirects to `/auth/sign-in`.**
5. **Request a sign-in code.** In production the code must **not** appear on
   screen. If it does, `NODE_ENV` is not `production`.
6. **The code email arrives** from your `EMAIL_FROM` address. If it does not,
   email is misconfigured and nobody can sign in.
7. **Enter the code and land on `/app`.** Reload the page — the session persists
   (this proves `AUTH_SECRET` is set and stable across instances).
8. **Enter a wrong code** — expect "That code is not correct." Five wrong
   attempts should give "Too many incorrect codes. Request a new one."
9. **Check the mode banner.** On a fully configured deployment
   `src/components/app/mode-notice.tsx` renders nothing. If you see "Running in
   deterministic extraction / development billing / local storage", one of your
   modes did not upgrade.
10. **`/app/settings` configuration panel** shows AI mode with the model id,
    storage mode, and any warnings. Zero warnings is the target.
11. **Upload the sample document** from `/app/awards/new` ("try a sample").
    Watch the progress list advance through *Securing document → Reading
    document → Identifying award details → Finding obligations → Checking source
    references → Preparing review*. These are streamed NDJSON events, not a
    timer. If they all appear at once, streaming is being buffered by a proxy.
12. **The award page shows obligations, all marked "Needs review".** Nothing
    should be pre-confirmed.
13. **Open the Evidence Rail on any obligation**, click a citation, and confirm
    the source panel shows the stored passage with the quoted sentence
    highlighted, and a locator like "Page 3".
14. **Upload the same document again.** You should be returned to the existing
    award, not a duplicate — `ingestDocument` matches on the SHA-256 content
    hash.
15. **Upload a scanned/image-only PDF.** Expect a clean failure: "This PDF has
    no readable text layer, which usually means it is a scan or photo…" and an
    award marked failed, not a crash.
16. **Upload a 20 MB file.** Expect the 15 MB rejection message, with the actual
    size quoted back.
17. **Confirm one obligation with a due date.** With reminders enabled on the
    plan, reminder rows are scheduled.
18. **Export CSV, ICS and JSON** from the award page. Open the CSV in a
    spreadsheet and confirm no cell executes as a formula — values starting
    `=`, `+`, `-` or `@` are prefixed with an apostrophe. Import the ICS into a
    calendar and confirm the events land on the right dates.
19. **Open `/app/awards/[id]/plan` and print to PDF.** Navigation and footer
    should disappear, links should print their URLs, and evidence quotes should
    keep their rule.
20. **Ask a question** on `/app/awards/[id]/ask` that the document does not
    address. Expect the "this award's documents do not appear to address that"
    answer — not a plausible general-knowledge answer.
21. **`curl` the cron endpoint with the correct bearer token** and confirm
    `{"ok":true,…}`. Then `curl` it with a wrong token and confirm `401`.
22. **`curl` an export URL while signed out** and confirm `404` (not `401` — the
    route deliberately does not distinguish "no such award" from "not yours").
23. **If Stripe is live:** run one real checkout with a test card, confirm the
    webhook arrived in the Stripe dashboard, and confirm the plan changed on
    `/app/settings`.
24. **Delete the test award** from the award page's danger zone and confirm it
    and its document disappear.

---

## 25. Monitoring

There is no APM integration and no error-reporting service wired in. What you
have is structured console logging, which on Vercel means Runtime Logs and Log
Drains.

### Log lines the code emits

| Prefix | Where | Contains |
| --- | --- | --- |
| `[ingest] unexpected failure` | `api/awards/ingest` | organisation id and error message |
| `[cron:reminders]` | `api/cron/reminders` | `{ considered, sent, skipped, failed }` per run |
| `[cron:reminders] failed` | same | error message |
| `[stripe] signature verification failed` | webhook | error message |
| `[stripe] handler failed` | webhook | event type and error message |
| `[billing] checkout failed` | `startCheckoutAction` | organisation id and error message |
| `[email:console]` | `email/index.ts` in console mode | redacted recipient and subject only |

Note what is deliberately absent: no document text, no obligation text, no email
bodies, no card details, no amounts, no key material. Audit event metadata is
explicitly commented as free of document text.

### The audit trail

`audit_events` (in the local store, `db.auditEvents`, capped at 5000 rows) is
the in-product record. Event types emitted today:

* `award.processed` — obligation count, citation coverage, model, injection
  attempt count, dropped-unsupported count
* `award.deleted`, `document.deleted`
* `billing.checkout_completed`, `billing.subscription_updated`,
  `billing.subscription_cancelled`, `billing.payment_failed`,
  `billing.development_grant`

In the Postgres schema `audit_events` is insert-and-select only, so the record
cannot be edited by the person it describes.

### What to watch

* **`droppedUnsupported > 0` on real documents.** The model is producing quotes
  that are not in the source. If this is chronic, change `AI_MODEL`.
* **Citation coverage trending down.** `award.processed` records it per run.
* **`failed > 0` in the cron summary.** Reminders are failing to send; the
  reminder row keeps `lastError` and will retry next run.
* **Repeated `[stripe] signature verification failed`.** Either the webhook
  secret is wrong or someone is probing the endpoint.
* **Function duration approaching 300 s** on `/api/awards/ingest`.

### The rate-limiting caveat

`src/lib/security/rate-limit.ts` is an in-process `Map`. It is documented in the
code as a **cost guard, not a security boundary**, and it is per-instance: a
deployment running N instances has an effective ceiling of N × the configured
limit. Authorisation is enforced separately on every request and does not depend
on it. If you need a true global limit, that is a Redis (or Vercel KV)
dependency the MVP deliberately does not take.

---

## 26. Backups and deletion

### Backups

**On the local store there is no backup.** `/tmp/awardlens-data` on Vercel does
not survive a redeploy or an instance recycle, and there is nothing to snapshot.
This is the strongest single argument for finishing the Supabase adapter before
onboarding customers.

**On Supabase**, backups are the platform's: automatic daily backups on paid
plans, plus point-in-time recovery where offered. Verify the retention window on
your plan and test a restore before you rely on it. `supabase db dump` gives you
your own copy:

```bash
cd awardlens
supabase db dump --linked -f backup-$(date +%Y%m%d).sql
```

Storage objects are backed up separately from the database — check your
project's storage backup settings.

**User-driven backup already exists.** The JSON export
(`GET /api/awards/[awardId]/export/json`) is deliberately self-describing: it
carries review state, confidence, interpretation level, source status and every
citation, so an organisation leaving AwardLens keeps the information that makes
the register trustworthy rather than a bare list of dates. It contains no
document bytes. Encourage pilot users to export.

### Deletion

Three levels, all implemented:

1. **Delete a document** — `deleteDocumentAction`. Removes the document row, its
   segments and its bytes. Obligations survive but their source passages can no
   longer be opened; the UI says exactly that.
2. **Delete an award** — `deleteAwardAction`. Removes the award, its documents
   and bytes, segments, processing runs, obligations, citations, reminders, ask
   exchanges and export records. **There is no soft delete** — the comment in
   the code is explicit that a user asking to remove a private grant document
   should get exactly that.
3. **Delete all organisation data** — `deleteAllDataAction`. Requires the user
   to type the organisation's name. Calls `deleteOrganizationData`, which
   removes document bytes first and then every row belonging to the
   organisation, then destroys the session and redirects to `/?deleted=1`.

Under Postgres, the ordering matters and `supabase/README.md` documents it:
rows that belong to a *user* cascade with the profile; rows that belong to an
*organisation* but record who created them (`organizations.created_by`,
`awards.created_by`, `exports.generated_by`) use `on delete restrict`, so
deleting the auth user fails loudly rather than silently orphaning an
organisation's compliance record. The correct order for a real deletion request:

1. Run organisation data deletion for any organisation the user solely owns, or
   transfer ownership.
2. Remove the membership rows.
3. Delete the auth user, which cascades to the profile.

A foreign key violation at step 3 means step 1 was incomplete. That is the
constraint doing its job.

---

## 27. Common problems

### The upload says "This PDF has no readable text layer"

The PDF is a scan or a photo. `parsePdf` extracts text with `unpdf`, and if the
total usable characters across all pages is under 200 it returns
`status: "no_text_layer"`. **OCR is not implemented.** The message tells the
user to paste the text instead, and the paste path accepts up to 400,000
characters. The award record is marked `failed` but is kept, so nothing is lost.

### "This PDF is password protected"

`getDocumentProxy` is called before text extraction specifically so encrypted
files fail early. A `PasswordException` (or any error whose message mentions a
password) produces `status: "password_protected"` and the message "Remove the
password and upload it again — AwardLens cannot open encrypted files."
There is no password prompt and no decryption path.

### Vercel builds the wrong thing, or fails with "no framework detected"

The Root Directory is not set to `awardlens`. See
[§22](#22-vercel-deployment). This is the most common deployment failure with
this repository, because the repo root is a static HTML site with no
`package.json`.

Related symptom: you set the Root Directory correctly but Cron never fires —
`vercel.json` must be at `awardlens/vercel.json`, not the repository root.

### The production deployment throws on every request

```
Error: AUTH_SECRET is required in production. Generate one with `openssl rand -base64 32`.
```

`getSecret()` in `src/lib/auth/session.ts` refuses to generate a secret in
production, because each serverless instance would mint its own and sessions
would break unpredictably. Set `AUTH_SECRET` (at least 16 characters) and
redeploy. Note that changing `AUTH_SECRET` invalidates every existing session
cookie and every outstanding login code.

### Nobody can sign in to production

The sign-in form returns:

> Email delivery is not configured on this deployment, so sign-in codes cannot
> be sent. Set RESEND_API_KEY and EMAIL_FROM.

`emailMode` is `console`, and in production the code is never returned to the
browser. **Configure Resend.** There is no bypass. See
[§15](#15-resend-setup).

### The reminder cron returns 503

```json
{"ok": false, "error": "CRON_SECRET is not configured, so the reminder job is disabled. …"}
```

`CRON_SECRET` is unset on the server. The endpoint deliberately refuses to run
rather than allow an unauthenticated job that can email your users. Set it in
Vercel and redeploy.

If you get **401** instead, the secret is set but the `Authorization: Bearer …`
value does not match — check for trailing whitespace, and remember that Vercel
Cron uses the project's `CRON_SECRET` automatically.

### "You have used your free award analysis"

`checkAwardEntitlement` blocked the upload. The free `demo` plan allows one
award. The effective limit is `plan.awardLimit + subscription.awardCredits`.
Options: upgrade the plan, or — in a non-production environment with
`DEVELOPMENT_BILLING_MODE` on — grant a plan from `/app/settings`, which writes
a `billing.development_grant` audit event so it can never be mistaken for a
payment.

In a production build, development billing refuses to grant anything.

### Uploading a document returns an award I already have

Working as designed. `ingestDocument` hashes the raw bytes with SHA-256 and, if
an existing document in the same organisation has the same hash, returns that
award with `duplicate: true` rather than creating a second one and paying for a
second extraction. To force a re-analysis of the same document, use the
re-analyse action on the award page — it reuses the stored segments, keeps the
award id stable, and preserves anything you manually created or already
reviewed.

### Extraction says "AwardLens analysed the first 60 sections"

`MAX_SEGMENTS_PER_RUN = 60`. The document is longer than one run reads. The
warning is shown to the user verbatim. For very long agreements, split the
document or raise the constant knowing it raises cost proportionally.

### Obligations appear with no due date and a question about which date applies

Working as designed, and one of the more important behaviours in the product.
`consolidateCandidates` found more than one distinct stated date for the same
requirement. It stores **no** due date, records every stated date in
`dateConflicts` with its locator, and writes the clarification question "The
document gives more than one due date for this requirement (X and Y). Which date
applies?" A human resolves it. Fixture `05-conflicting-dates` exercises exactly
this.

### An obligation is flagged "Source confirmation needed"

Its best citation scored below 0.5 against every stored segment
(`PARTIAL_THRESHOLD`), so no locator was attached. Between 0.5 and 0.85 you get
"Partial source match"; at or above 0.85, "Source verified". A candidate whose
citations resolve to *nothing* is not shown at all — it is discarded and counted
in `droppedUnsupported`.

### The mode banner says "development billing" in production

Either Stripe is not fully configured (both `STRIPE_SECRET_KEY` **and**
`STRIPE_WEBHOOK_SECRET` are required) or `DEVELOPMENT_BILLING_MODE` is truthy.
`getServerConfig()` also adds a warning to the settings page for this exact
case.

### Environment changes have no effect

`getServerConfig()` memoises into a module-level `cached` variable. Restart
`pnpm dev`, or redeploy on Vercel. `resetServerConfigCache()` exists but is
labelled test-only.

### Sessions vanish at random on Vercel

You are on the local store. Each lambda instance has its own
`/tmp/awardlens-data`, so the profile your signed cookie points at may not exist
on the instance that serves your next request. This is the ephemerality warning
made visible. Either accept it for a demo (`ALLOW_LOCAL_STORE=true`) or finish
the Supabase adapter.

### `pnpm test:e2e`, `pnpm test:accessibility`, `pnpm test:ai-fixtures`, `pnpm test:ai-live` all fail

The files they point at do not exist yet. See [§19](#19-test-commands). Use
`pnpm test`, `pnpm test:unit` and `pnpm test:integration`.

### A committed `.awardlens-data/`

`awardlens/.gitignore` does not list it. If it is already committed:

```bash
cd awardlens
printf '\n.awardlens-data/\n' >> .gitignore
git rm -r --cached .awardlens-data
git commit -m "Stop tracking the local AwardLens data store"
```

Then rotate `AUTH_SECRET` if the generated `auth-secret` file was ever pushed.

---

## 28. Rollback

### Application rollback (Vercel)

Vercel keeps every deployment. To roll back:

1. Project → **Deployments**.
2. Find the last known-good deployment.
3. **⋯ → Promote to Production** (or "Instant Rollback" where offered).

This is atomic and takes seconds. Because AwardLens keeps no build-time state
beyond the statically rendered `/demo`, an application rollback carries no data
implications **on the local store** — there is nothing durable to be
inconsistent with.

### Environment variable rollback

Environment changes are **not** covered by a deployment rollback in the general
case: promoting an old deployment re-runs it against the *current* environment
for server-read variables, while `NEXT_PUBLIC_*` values are frozen into the old
build. If you changed a `NEXT_PUBLIC_*` variable, roll back the variable **and**
redeploy.

Safe-by-construction rollbacks:

* Removing `AI_GATEWAY_API_KEY` or setting
  `USE_DETERMINISTIC_AI_FIXTURES=true` immediately returns extraction to the
  deterministic path. The product keeps working; it just gets more literal. This
  is a genuine kill switch for model spend or a misbehaving model.
* Removing `STRIPE_SECRET_KEY` puts billing into development mode, which in a
  production build refuses to grant anything. Existing subscriptions are
  untouched in Stripe.
* Removing `CRON_SECRET` stops reminders (503) without losing any scheduled
  reminder rows — they are re-evaluated when the job runs again.

### Database rollback (once Supabase is wired)

The migrations are forward-only; there are no `down` scripts. Rolling back a
schema change means writing a new migration that reverses it. Before applying
anything to a production database:

```bash
cd awardlens
supabase db dump --linked -f pre-migration-$(date +%Y%m%d%H%M).sql
supabase db diff --linked        # see exactly what would change
supabase db push
```

If a migration goes wrong, restore from that dump or from the platform's
point-in-time recovery, then write the corrective migration.

### Rolling back a model change

Because `AI_MODEL` is configuration, reverting to a previous model is an
environment edit plus a redeploy — no code change. `promptVersion` and `model`
are stored on every `processing_runs` row, so you can tell which model and which
prompt version produced any given register.

---

## 29. One-day MVP path

A single focused day, assuming the repository is already in the state described
here. This produces a **credible demo**, not a customer-ready product.

**Morning — get it running and understood (3 h)**

1. `pnpm install && pnpm dev`. Confirm `/`, `/demo`, sign-in, upload of the
   sample. (30 min)
2. Read, in this order: `src/lib/env/index.ts`, `src/lib/ai/citations.ts`,
   `src/lib/ai/consolidate.ts`, `src/lib/awards/process.ts`. These four files
   are the product. (60 min)
3. `pnpm verify`. Confirm green. (15 min)
4. Add `.awardlens-data/` to `awardlens/.gitignore`. (5 min)
5. Upload three or four of the `tests/fixtures/` documents by pasting them, and
   read the output critically — especially `05-conflicting-dates` and
   `09-prompt-injection`. (60 min)

**Afternoon — deploy the demo (3 h)**

6. Create the Vercel project with **Root Directory `awardlens`**. (15 min)
7. Set `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`, `ALLOW_LOCAL_STORE=true`. Deploy.
   (30 min)
8. Set up Resend, verify a domain, set `RESEND_API_KEY` and `EMAIL_FROM`.
   Redeploy. Confirm you can sign in to production. (60 min)
9. Create an AI Gateway key, run `pnpm models:list`, set `AI_MODEL` and
   `USE_DETERMINISTIC_AI_FIXTURES=false`. Redeploy. (30 min)
10. Run smoke tests 1–20 from [§24](#24-post-deployment-smoke-tests). (45 min)

**End of day — what you have**

A live deployment with real model extraction, working sign-in, and a demo you
can put in front of someone. Data is ephemeral. No payments. No reminders.
The mode banner tells every visitor it is running on local storage, which is the
honest thing for it to say.

**What you explicitly do not have:** durability, reminders, billing, or any
multi-user story.

---

## 30. One-week build path

Five working days to something you could reasonably run a pilot on.

### Day 1 — Foundations and honesty

* Everything in the one-day path.
* Replace `awardlens/README.md` — it is still the `create-next-app` template.
  Point it at this guide.
* Add `.awardlens-data/` to `.gitignore`.
* Set up CI running `pnpm verify` on every push. Do **not** include the four
  broken test scripts.

### Day 2 — Durability, part 1

This is the big one and it will take longer than you want.

* Extract the `DbAdapter` interface from `src/lib/db/local.ts` into
  `src/lib/db/types.ts`.
* Create `src/lib/db/index.ts` selecting an implementation from
  `getServerConfig().storageMode`.
* Change the fifteen `@/lib/db/local` imports to `@/lib/db`. Confirm
  `pnpm verify` is still green — nothing should behave differently yet.
* Create a Supabase project, run `supabase db reset` locally, run the RLS
  verification queries from [§9](#9-database-migrations).

### Day 3 — Durability, part 2

* Write `src/lib/db/supabase.ts`: case mapping, per-call client selection
  (user token vs. service role), and `saveDocumentBytes`/`readDocumentBytes`
  against the `award-documents` bucket using the exact path convention.
* Decide the authentication question: keep the custom email-code flow and add a
  `login_codes` table, or migrate to Supabase Auth OTP. `supabase/README.md`
  lists this as a known gap; it is not optional.
* Run the 14 negative tests from `supabase/README.md`, as `authenticated`, not
  as `postgres`.
* Point the integration suite at Supabase and get it green.

### Day 4 — Reminders and evaluation

* Add `awardlens/vercel.json` with the daily cron entry. Set `CRON_SECRET`.
  Deploy. Verify with `curl`, then verify a real reminder arrives.
* Write `tests/integration/extraction-eval.test.ts` so
  `pnpm test:ai-fixtures` and `pnpm test:ai-live` do what their names say.
  Use `PipelineOptions.forceMode`, drive it from `AWARDLENS_LIVE_EVAL`, and skip
  cleanly when the live credentials are absent.
* Run the live eval against all 12 fixtures. Record coverage and
  `droppedUnsupported` per fixture as your baseline.

### Day 5 — Billing, accessibility, launch prep

* Stripe: create prices, set the four Stripe variables, set
  `DEVELOPMENT_BILLING_MODE=false`, configure the production webhook, and run a
  real test-mode checkout end to end.
* Add `playwright.config.ts` and a first `tests/e2e/accessibility.spec.ts` using
  the already-installed `@axe-core/playwright`, so `pnpm test:accessibility`
  stops being a lie. Cover at minimum `/`, `/pricing`, `/demo`, `/auth/sign-in`,
  `/app`, and one award page.
* Run the full smoke test list from [§24](#24-post-deployment-smoke-tests).
* Work the pilot launch checklist in [§31](#31-pilot-launch-checklist).

**Realistic scope note.** Days 2 and 3 are the whole week's risk. If the
Supabase adapter and the auth decision take longer, ship the pilot on the local
store with `ALLOW_LOCAL_STORE=true`, tell your pilot users in writing that data
is not durable, and finish the adapter in week two. That is a defensible
sequence. Quietly shipping ephemeral storage to people storing grant agreements
is not.

---

## 31. Pilot launch checklist

### Configuration

- [ ] Vercel **Root Directory is `awardlens`**
- [ ] `AUTH_SECRET` set, ≥ 16 characters, generated with `openssl rand -base64 32`
- [ ] `NEXT_PUBLIC_APP_URL` is the final `https://` origin, and the app has been
      **redeployed** since it was set
- [ ] `RESEND_API_KEY` and `EMAIL_FROM` set, sending domain verified
- [ ] `AI_GATEWAY_API_KEY` and `AI_MODEL` set, `AI_MODEL` taken from a real
      `pnpm models:list` run
- [ ] `USE_DETERMINISTIC_AI_FIXTURES=false`
- [ ] `CRON_SECRET` set **and** `awardlens/vercel.json` committed with the daily
      cron entry
- [ ] If charging: all four Stripe variables set and
      `DEVELOPMENT_BILLING_MODE=false`
- [ ] `/app/settings` shows **zero** configuration warnings
- [ ] The mode banner does not appear on authenticated pages

### Storage decision — pick one and be explicit

- [ ] **Supabase adapter is finished**, migrations applied, RLS verification
      queries return nothing, and the 14 negative tests pass as `authenticated`
- [ ] **or**: `ALLOW_LOCAL_STORE=true` is set, and every pilot user has been
      told **in writing** that their data is ephemeral and may be lost on any
      redeploy

### Verification

- [ ] `pnpm verify` green on the exact commit being deployed
- [ ] Smoke tests 1–24 in [§24](#24-post-deployment-smoke-tests) all pass
      against production
- [ ] Live eval run over all 12 fixtures; `droppedUnsupported` at or near zero
- [ ] `05-conflicting-dates` produces no due date and a clarification question
- [ ] `09-prompt-injection` reports the passages as ignored and the output is
      unaffected
- [ ] `11-empty-scanned` fails cleanly with the paste-the-text message
- [ ] A real reminder email was received end to end

### Product honesty

- [ ] Every obligation lands as "Needs review" — nothing is pre-confirmed
- [ ] Citations show real locators and the source panel highlights the real
      passage
- [ ] The disclaimer that AwardLens does not provide legal, accounting or
      compliance advice is present in the UI, the JSON export and the email
      footer
- [ ] Pilot users are told what is **not** built: no OCR, no multi-user
      organisations, no Team-plan shared workspace

### Operations

- [ ] Someone owns the Vercel Runtime Logs for the first week
- [ ] Someone checks the daily `[cron:reminders]` summary
- [ ] Stripe webhook delivery is green in the Stripe dashboard
- [ ] A rollback has been rehearsed once — promote a previous deployment and
      confirm the site still works
- [ ] Backup/export path agreed with pilot users (JSON export at minimum)
- [ ] A named contact for pilot users to report a wrong extraction to, and a
      place to record it

### Legal and comms

- [ ] Privacy statement covers: award documents are stored, parsed and sent to
      a model provider in live mode; where they are stored; how deletion works
- [ ] Terms make clear AwardLens is decision support, not legal, accounting,
      tax or compliance advice, and asserts no certification
- [ ] Deletion path (`/app/settings` → delete all data) has been tested by a
      real person

---

*This guide describes the AwardLens codebase as of 2026-07-28. Where behaviour
and this document disagree, the code is correct — file paths are given
throughout so you can check.*
