# AwardLens

Turn a grant award document into a source-linked operating plan.

A nonprofit uploads a grant agreement, award letter or notice of award.
AwardLens extracts the obligations it contains — reporting deadlines,
deliverables, financial restrictions, prior-approval triggers, records
retention, closeout and renewal terms — and links every one of them back to the
exact page or section it came from. A person reviews and confirms each item
before it counts. The result exports as a register, a calendar, JSON, and a
printable operating plan.

> AwardLens is a workflow and decision-support tool. It does not provide legal,
> accounting, tax or compliance advice, and it cannot guarantee that every
> requirement in a document was found.

---

## Quick start

```bash
pnpm install
pnpm dev
```

Open <http://localhost:3000>.

**No configuration is required.** With no environment variables set, the app
runs end to end: it stores data in a local file store, extracts obligations with
a built-in deterministic extractor, grants plans without payment, and prints
sign-in codes to the screen instead of emailing them. Every one of those
subsystems upgrades independently as you add credentials, and the app tells you
which mode it is in on every screen.

Copy `.env.example` to `.env.local` when you are ready to connect real services.

---

## How it is configured

`src/lib/env/index.ts` derives four independent modes:

| Subsystem | Default (no credentials) | Upgraded by |
|---|---|---|
| **Storage** | Local JSON file store under `.awardlens-data/` | **Nothing yet — see below** |
| **Extraction** | Deterministic rule-based extractor — offline, free, reproducible | `AI_GATEWAY_API_KEY` + `AI_MODEL`, with `USE_DETERMINISTIC_AI_FIXTURES=false` |
| **Billing** | Development mode — plans granted without payment, refuses to grant in a production build | `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`, with `DEVELOPMENT_BILLING_MODE=false` |
| **Email** | Console — recipient and subject logged, body never logged | `RESEND_API_KEY` + `EMAIL_FROM` |

### Storage is the one that has not landed yet

`supabase/migrations/` contains the production Postgres schema with row-level
security, verified against a live Postgres (16 tables, 54 policies, negative
tests for cross-organisation access). **But no Supabase client is wired into the
application.** `@/lib/db` resolves to the file-backed store, and setting the
Supabase environment variables changes nothing except adding a warning telling
you so.

This matters more than an ordinary "not done yet". On a serverless host the file
store lives in `/tmp`: it is per-instance, ephemeral, and a crash on one instance
can lose data belonging to another tenant on it. Treat this build as suitable for
local use, demos and single-tenant pilots — not for holding several
organisations' confidential grant documents.

Wiring it up means adding `src/lib/db/supabase.ts` implementing the same exported
surface, switching the re-export in `src/lib/db/index.ts` on
`getServerConfig().storageMode`, and flipping `SUPABASE_ADAPTER_IMPLEMENTED` in
`src/lib/env/index.ts`. No caller names an implementation, so nothing else
changes.

Two things are genuinely required in production:

- **`AUTH_SECRET`** — session signing. The app throws without it.
- **`RESEND_API_KEY`** — in a production build, sign-in codes are never shown on
  screen. Without email delivery, nobody can sign in.

Do not guess a model id. List the ones your gateway key can actually reach:

```bash
AI_GATEWAY_API_KEY=... pnpm models:list
```

---

## The guarantee that matters

Everything else in this codebase is ordinary. This part is not.

**A source locator is never taken from the model.** When an extraction claims
"page 7", AwardLens matches the quoted excerpt back against the stored document
segments and reads the locator from the segment the text was *actually* found
in. A declared segment id is only a hint. If the quote exists nowhere in the
document, the claim gets no locator at all and the obligation is shown as
"source confirmation needed" rather than quietly displayed as fact.

See `src/lib/ai/citations.ts`. It is enforced mechanically, not by prompting.

Three related rules:

- **Nothing is auto-confirmed.** Every extracted item is stored as
  `needs_review`. The model cannot confirm its own output.
- **Contradictions are never resolved silently.** When a document states two
  different dates for the same requirement, AwardLens stores no due date, keeps
  both dates visible, and raises a question for the funder.
- **Document text is data, never instruction.** Uploaded text is fenced and the
  model is told it cannot change the task. Instruction-like passages are
  detected, ignored, and reported to the user.

---

## Commands

```bash
pnpm dev              # development server
pnpm build            # production build
pnpm start            # serve the production build

pnpm typecheck        # tsc --noEmit
pnpm lint             # eslint
pnpm test             # unit + integration (vitest)
pnpm test:unit
pnpm test:integration
pnpm test:e2e         # playwright
pnpm test:accessibility

pnpm test:ai-fixtures # extraction evaluation, deterministic
pnpm test:ai-live     # same evaluation against a live model (needs credentials)

pnpm models:list      # model ids your gateway key can reach
pnpm verify           # typecheck + lint + test + build
```

---

## Layout

```
src/
  app/
    (marketing)/          landing, pricing, worked sample
    (auth)/auth/          sign-in
    (app)/app/            dashboard, upload, award workspace, review,
                          register, ask, operating plan, settings
    api/                  ingest (NDJSON stream), exports, stripe, cron
    actions/              server actions
  components/
    ui/                   Radix-based primitives (shadcn conventions)
    evidence/             the Evidence Rail — the signature surface
    obligations/          review workspace, register, editor
    documents/            upload flow, source panel
  lib/
    ai/                   schemas, prompts, pipeline, citations, consolidation,
                          deterministic extractor, ask
    documents/            validation, parsing, segmentation
    domain/               types, date reasoning
    db/                   storage seam (local file store today)
    auth/ billing/ email/ exports/ reminders/ security/ env/
supabase/                 production Postgres schema + row-level security
tests/                    unit, integration, e2e, synthetic award fixtures
```

---

## Extraction pipeline

1. **Validate** — type, size, content hash, duplicate detection, usable-text check
2. **Segment** — preserve page boundaries; strip repeated headers/footers only when safe
3. **Award profile** — identity fields, `null` rather than a guess
4. **Obligation candidates** — extracted per batch of segments
5. **Consolidate** — deterministic merge; contradictions preserved
6. **Validate citations** — locator resolved from stored text; unsupported claims discarded
7. **Completeness critic** — a second pass hunting commonly missed requirements
8. **Persist for review** — everything lands as `needs_review`

Measured on 12 synthetic awards in deterministic mode: 77.4% critical-obligation
recall, 100% citation coverage, 0% unsupported claims. Run
`pnpm test:ai-fixtures` to reproduce.

---

## Deployment

This app lives in the `awardlens/` subdirectory of a repository whose root is a
separate static site. **Set the Vercel project's Root Directory to `awardlens`.**
That is the most common deployment mistake here.

`vercel.json` declares the daily reminder cron and baseline security headers.
The reminder endpoint refuses to run unless `CRON_SECRET` is set.

Full instructions, including Supabase migrations, Stripe webhooks and a
post-deployment smoke test, are in `../20260728_AwardLens-Build-Guide.md`.

---

## Known limitations

- **Scanned documents are not supported.** No OCR. Scans are detected and
  explained rather than silently mis-parsed.
- **The Supabase adapter is not wired in yet.** The schema, RLS policies and
  storage rules are complete and verified against a real Postgres, but the app
  currently imports the local file store. On a serverless host that store is
  per-instance and ephemeral.
- **DOCX and pasted text have no page numbers.** They use section or paragraph
  locators, labelled as such. AwardLens never invents a page number.
- **Documents incorporated by reference** (2 CFR Part 200, a funder handbook,
  "Exhibit B") are listed but not analysed. They carry their own requirements.
- **Rate limiting is per-instance.** It is a cost guard, not a security boundary.
- **Amendments** are not reconciled against the original award.
- **No calendar sync.** Export `.ics` and import it yourself.
