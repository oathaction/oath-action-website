# AwardLens — Testing and Release Report

Verification record and release recommendation.

---

## 1. Summary

| Check | Result |
|---|---|
| Unit + integration tests | **471 passing**, 16 files, 0 failing |
| Typecheck (`tsc --noEmit`, strict) | Clean |
| Lint (ESLint 9) | Clean, 0 errors, 0 warnings |
| Production build (Next 16 / Turbopack) | Succeeds, 17 routes |
| CI (GitHub Actions, hermetic) | Green |
| Extraction evaluation, 12 synthetic awards | 77.4% recall, **100% citation coverage**, **0% unsupported claims** |
| Row-level security, live Postgres 16 | 16/16 tables, 54 policies, all negative tests pass |
| Independent security review | No Critical, **no cross-organisation access path** |
| Dependency audit | 2 advisories, both unreachable (see §6) |

**Recommendation: ship as a single-tenant pilot, not as multi-tenant
production.** The workflow is complete and verified. The blocker is storage,
not correctness — see §7.

---

## 2. What was tested, and how

### Unit — 460 tests across 14 files

Written by an independent QA agent that did not write the source. Concentrated
on the logic where a defect would be invisible in the UI: citation resolution,
date reasoning, segmentation, consolidation, CSV/ICS generation, entitlements,
rate limiting, and the deterministic extractor.

Security invariants pinned by explicit tests:

- A **fabricated excerpt gets no locator** — `segmentId: null`, empty
  `locatorValue`, `sourceStatus: "unverified"`.
- When the model **declares the wrong segment id** but its quote exists
  elsewhere, the returned locator is the **real** segment's. A model claiming
  "page 7" for a quote living on page 3 gets page 3.
- **CSV formula injection** neutralised for `=`, `+`, `-`, `@`, tab and CR,
  including the prefix-then-quote path.
- **ICS folding never splits a multi-byte character** (2-byte and 4-byte cases).
- **A contradiction is never silently resolved**: two- and three-way date
  conflicts yield `dueDate: null`, a populated `dateConflicts` array with
  per-source locators, and a clarification question naming every date.
- **Prompt injection**: ten attack shapes detected; benign award language not
  flagged; real obligations still extracted from the injected fixture.

### Integration — 11 tests against the real store, no mocks

Runs the actual ingestion pipeline end to end: upload → hash → parse → segment →
extract → cite → persist. Covers duplicate detection, entitlement limits,
parse-failure paths, exports, reminder scheduling and idempotency, and deletion.

The organisation-isolation tests attack the boundary directly with a valid
session and another organisation's ids, and assert that reads return null,
writes return null, and deletes return false.

### End-to-end — Playwright, real browser, real dev server

Sign-in through the actual six-digit code flow, sample analysis, review,
editing, export downloads, deletion, mobile viewports, and axe accessibility
scans. Findings are in §4; the suite found three real bugs the other layers
missed.

### Extraction evaluation — 12 synthetic award documents

Authored by a domain-expert agent with a manifest of the obligations each
document actually contains, every citation phrase verified present in the text.
Fixtures include a document with genuinely contradictory dates, one with a
missing final-report date, one that is not a grant at all, one with no usable
text, and one carrying three embedded prompt-injection blocks.

Measured in deterministic mode (`pnpm test:ai-fixtures`):

| Metric | Result |
|---|---|
| Critical-obligation recall | 77.4% (65/84) |
| Citation coverage (verbatim) | **100%** (192/192) |
| Unsupported-claim rate | **0%** |
| Date accuracy | 67.7% |
| Duplicate rate | 18.2% |
| Human review burden | 17.5 items per award |

Recall is reported, not gated tightly — a strict recall gate over twelve
documents would only encourage overfitting the rules to them. The gated
assertions are the honesty properties: zero unsupported claims, ≥95% citation
coverage, and no obligation reaching the register without a citation that
resolves to real stored text.

**These numbers describe the deterministic extractor**, which is deliberately
more literal than a model. `pnpm test:ai-live` runs the same evaluation against
a configured model. It has not been run — see §7.

---

## 3. Defects found and fixed

Fourteen real defects were found by review and testing. All are fixed with
regression tests. The ones that mattered:

| Severity | Defect | Found by |
|---|---|---|
| **Critical** | Account takeover in a draft `organization_members` insert policy: the bootstrap branch let any authenticated user insert themselves as **owner of any organisation whose id they could guess**, because `org_role` is NULL for any org you are not in. | Architect agent's own negative test |
| **High** | Setting Supabase env vars rendered "Storage: Supabase Postgres" with a green tick and silenced the ephemeral-store warning — while every document stayed in a JSON file with no RLS in effect. | Security review |
| **High** | Over-merging destroyed real deadlines: title-only matching collapsed a narrative report and a financial report into one, and their differing dates then read as a document contradiction, suppressing **both**. | Integration test |
| **High** | Sign-out did nothing. Radix closed the menu on select, detaching the form before submit; the 30-day session cookie could not be cleared on a shared machine. | E2E suite |
| **High** | CSV and ICS exports filtered on a field that does not exist, so every "Source locations" cell would have been blank and every calendar event would have read "Source: confirmation needed". | Typecheck |
| **Medium** | ICS escaping left a lone carriage return intact — enough to inject whole VEVENTs into a recipient's calendar via an obligation title. | Security review |
| **Medium** | The dev sign-in-code echo rested on a single `NODE_ENV` check: any non-production deployment became "type any email, receive that account's code". | Security review |
| **Medium** | No per-address limit on sign-in codes, and re-issuing reset the attempt lock — allowing indefinite request-and-guess plus mail-bombing. | Security review |
| **Medium** | Decompression bomb: a 15 MB DOCX went to the parser with no expansion cap; one upload could OOM the process and, on the file store, destroy other tenants' data. | Security review |
| **Medium** | `notFound()` returned **HTTP 200** for every award route, because a segment-root `loading.tsx` streamed the response before the status could be set. | E2E suite |
| **Medium** | Prompt-injection detection missed one of three injected blocks. | Unit tests |
| **Medium** | `findDatesInText` accepted "February 30" as a deadline. | Unit tests |
| **Medium** | Re-analysis deleted the whole award, discarding manual obligations and every review decision. | Self-review |
| **Low** | Cron secret compared UTF-16 lengths before a byte-wise compare, turning a failed auth into an unhandled 500. | Security review |

Also fixed: untrusted obligation titles interpolated into the critic prompt
outside any fence; document text able to close its own prompt fence; a literal
NUL byte that made a source file read as binary so `grep -r` silently skipped it;
a modulo bias in one-time code generation; a dead `assertMembership` helper
documented as an IDOR control with zero call sites; and stored document bytes
surviving award deletion.

---

## 4. Security review

An independent agent reviewed authentication, authorization, storage, prompt
handling, webhooks, cron, input validation, generated artefacts, logging, rate
limiting and the RLS schema, tracing call paths rather than pattern-matching.

**No Critical. No cross-organisation data access path. No unauthenticated read
path.** Specifically confirmed sound:

- **No IDOR.** Every store helper enforces `organizationId` *inside* the data
  layer, not only in its callers. Supplying another organisation's id to any
  action or route yields null → not-found.
- **No token forgery.** The HMAC payload is unambiguously delimited; a crafted
  user id cannot produce a valid token, and `timingSafeEqual` is unreachable
  with mismatched lengths.
- **No user enumeration** — identical responses whether or not the account
  exists.
- **The citation-grounding invariant holds.** A fabricated quote cannot acquire
  a page number; it cannot even reach the register.
- **The prompt fence cannot be escaped** by document or question content.
- **Webhook signatures are verified against the raw body**, and every event id
  is claimed exactly once.
- **Document bytes are genuinely deleted** on document, award and account
  deletion — no path traversal, nothing under `public/`.
- **Logs contain no document text, excerpts, tokens, secrets or sign-in codes.**
- **RLS**: enabled on all 16 tables, every `security definer` function has
  `search_path` pinned, every `for update` policy carries a matching
  `with check`, and no policy permits cross-organisation access.

Accepted and documented rather than fixed:

- **Sessions cannot be revoked.** Sign-out deletes the cookie; the signed token
  remains valid until expiry. Fixing this properly needs a server-side session
  record or a `sessionEpoch` in the signed payload. Recorded as the top
  post-pilot security item.
- **Rate limiting is per-instance.** A cost guard, not a security boundary.
- **No Content-Security-Policy.** The review found no injection sink for one to
  backstop — no `dangerouslySetInnerHTML`, no `eval`, no user-controlled
  `href`/`src`, all untrusted text rendered as escaped React children — but it
  should be added before a public launch.

---

## 5. Accessibility

Design system built for it: a single never-removed `:focus-visible` treatment,
semantic landmarks, labelled controls, `aria-pressed` on filter toggles,
`aria-sort` on sortable headers, `aria-live` on result counts and review
progress, Radix-managed dialog focus, 44px touch targets on mobile, colour never
the only signal, and `prefers-reduced-motion` honoured.

Verified: no horizontal overflow at 390px or 1280px on `/`, `/pricing` and
`/demo`; the landing page renders one `h1` with correct heading order. Axe scans
across the public and authenticated routes run in `tests/e2e/accessibility.spec.ts`.

---

## 6. Dependencies

`pnpm audit` reported five advisories, all transitive through `next` and
`eslint`. A `pnpm.overrides` pin for `postcss >=8.5.18` resolved three.

Two remain, **neither reachable**:

| Advisory | Path | Why it does not apply |
|---|---|---|
| `sharp <0.35.0` | `next > sharp` | In `ignoredBuiltDependencies` and not installed — `require.resolve("sharp")` fails. No `next/image` usage. |
| `brace-expansion <=5.0.7` | `eslint > minimatch > brace-expansion` | Dev-only lint toolchain, not in any runtime path. |

An earlier attempt to override `brace-expansion` broke ESLint (`minimatch@3`
needs the v1 CommonJS shape) and was reverted rather than worked around.

---

## 7. Not tested, and why

Stated plainly because these are the gaps a reader should weigh:

1. **No live model has ever run.** No AI gateway credentials were available. The
   live path is covered by types, schema validation and an evaluation harness
   that runs against it on request — but every extraction number in this report
   comes from the deterministic extractor. **Run `pnpm test:ai-live` before
   trusting live extraction quality.**
2. **The Supabase adapter does not exist.** The schema and RLS are complete and
   verified against a real Postgres, but nothing in the application uses them.
   All data is in a local file store that is per-instance and ephemeral on
   serverless. This is the release blocker for multi-tenant use.
3. **Stripe and Resend were never called for real.** Signature verification,
   idempotency, entitlement logic and email rendering are implemented and unit
   tested; no live transaction or delivery has occurred.
4. **No load or soak testing.** No concurrency testing of the file store beyond
   its serialised write queue.
5. **OCR is out of scope.** Scanned PDFs are detected and explained.

---

## 8. Release recommendation

**Substantially complete. Ship as a pilot; do not present as multi-tenant
production.**

Safe to do now:

- Local use, demos, and a single-organisation pilot on the graded-mode
  configuration.
- A public demo deployment, provided `AUTH_SECRET` and Resend are configured
  (without Resend, nobody can sign in to a production build) and
  `ALLOW_LOCAL_STORE=true` acknowledges the ephemeral store.

Required before holding multiple organisations' documents:

1. Wire the Supabase adapter and flip `SUPABASE_ADAPTER_IMPLEMENTED`.
2. Run the live-model evaluation and record real extraction numbers.
3. Make sessions revocable.
4. Exercise Stripe and Resend end to end in test mode.
5. Add a Content-Security-Policy.

The product's central claim — that every material obligation is traceable to the
page it came from, and that nothing is treated as confirmed until a person
confirms it — is enforced mechanically and is verified by tests that attack it
directly. That part is ready.
