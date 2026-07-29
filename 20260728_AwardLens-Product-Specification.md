# AwardLens — Product Specification (MVP)

**Version:** 1.0 · **Date:** 2026-07-28 · **Owner:** Agent 1 (Product Strategy)
**Inputs folded in:** Agent 3 (UX Research), Agent 12 (GTM Copy)

---

## 1. Product summary and the problem

AwardLens is post-award grant management for small US nonprofits. A user uploads a grant agreement, award letter, or notice of award (text-layer PDF, DOCX, or pasted text). AwardLens extracts a **source-linked register of obligations** — reporting deadlines, deliverables, performance measures, financial restrictions, allowable/unallowable uses, prior-approval requirements, branding requirements, records retention, closeout, renewal dates — each carrying a verbatim quote and a page/section citation. The user reviews and confirms every extracted item; nothing is authoritative until a human confirms it. The confirmed register exports as CSV, .ics, JSON, and a printable operating plan, and drives email reminders ahead of deadlines.

**Core promise:** *Upload an award. Know what was promised, what is due, who should own it, and where the requirement came from.*

**The pain, concretely:**

1. **Award documents are long and hostile to skimming.** A federal notice of award plus general terms runs 30–120 pages. A foundation agreement runs 4–15 pages but buries obligations mid-paragraph. Nobody rereads it after signature.
2. **Obligations are scattered, not listed.** There is rarely a "what you owe us" section. Reporting sits in §7, branding in an exhibit, prior-approval thresholds in incorporated terms, retention in boilerplate. Extracting by hand takes 2–5 hours per award and happens once, if ever.
3. **Deadlines are relative, not absolute.** "Within 30 days of each quarter end." "60 days after the project period ends." Converting these to dated items is manual arithmetic nobody redoes when a no-cost extension moves the end date.
4. **Consequences are asymmetric.** A late report can trigger a hold on drawdowns, a corrective action plan, or non-renewal. For a $900K organization with three restricted grants, one non-renewal is a program.
5. **Turnover erases institutional knowledge.** The person who read the agreement leaves. What remains is a PDF in Drive and entries in a personal calendar. The successor discovers obligations at audit.
6. **Existing tools don't fit.** Enterprise grant systems are built for grantmakers or dedicated compliance staff. Spreadsheets have no memory of *why* a row exists.

AwardLens is a **workflow and decision-support product**. It organizes what a document says. It does **not** give legal, accounting, tax, or compliance advice, and does **not** guarantee compliance or completeness.

---

## 2. Target user personas

**P1 — Executive Director (3–25 staff).** *Context:* wears every hat, signs the award then hands it off, 2–6 active restricted grants. *JTBD:* know what was committed, assign ownership, survive audit season. *Anxieties:* "I signed something I don't fully understand." "If our grants manager leaves, does anyone know what's due?" *Success:* a one-page printable operating plan with owners assigned, shareable with the board finance committee.

**P2 — Grants / Development Manager.** *Context:* primary operator, 5–20 active awards, lives in spreadsheets and a shared calendar, writes the reports. *JTBD:* build a reporting calendar for a new award in under an hour; verify every date against the document. *Anxieties:* "I built the calendar from the cover letter and missed the attachments." "I can't prove where this date came from." *Success:* register confirmed and exported in one sitting, every row traceable.

**P3 — Finance Leader (DoF, fractional CFO, bookkeeper).** *Context:* owns drawdowns, allocations, audit prep; cares about cost restrictions more than narrative deadlines. *JTBD:* identify unallowable costs, indirect-rate and match terms, prior-approval thresholds, budget-modification rules, retention periods. *Anxieties:* "We charged something we shouldn't have." "We moved budget between lines without approval." *Success:* a filtered view of financial restrictions with verbatim quotes, exportable into the audit file.

**P4 — Program Manager.** *Context:* delivers the work, rarely sees the agreement, learns deliverables secondhand. *JTBD:* know which deliverables and performance measures they own and when. *Anxieties:* "I'm measured on numbers I never saw." "A deadline will land on me with three days' notice." *Success:* reminders for their items only, actionable without learning a new system.

**P5 — Independent Grant Consultant.** *Context:* 4–12 nonprofit clients; onboards by reading inherited awards; bills hourly or on retainer. *JTBD:* rapidly assess a client's post-award exposure and produce a credible deliverable. *Anxieties:* "I'll be blamed for something in a document I inherited." "This has to look client-ready." *Success:* a branded operating plan produced in 30 minutes that becomes billable work.

---

## 3. Core user journey

1. User signs up by email, creates or joins an organization, sets time zone and fiscal year end.
2. User creates an award and uploads a PDF/DOCX or pastes text.
3. AwardLens validates type, size, page count, and presence of a text layer. No text layer: it stops and says so. It does not attempt OCR.
4. The document is parsed into pages and sections with stable locators; the user sees a live processing state with an ETA.
5. Extraction proposes award metadata (funder, award number, amount, period of performance) and candidate obligations — each with type, verbatim quote, citation, plain-language restatement, extraction basis, and confidence band.
6. User confirms award metadata first, especially period of performance, because relative dates depend on it.
7. User enters the **review queue**: one candidate at a time, source excerpt beside the proposed record. For each: confirm, edit-and-confirm, reject, or flag "source confirmation needed." The user can add missed obligations.
8. Date resolution: relative and recurring rules are converted to concrete dates derived from confirmed award dates; the user confirms or overrides.
9. User assigns an owner and optional per-item lead times.
10. Review completes when every candidate is dispositioned. The workspace shows the confirmed register with unconfirmed items visibly quarantined.
11. User exports CSV, .ics, JSON, and the printable operating plan.
12. Email reminders begin — per-obligation lead-time notices to owners, plus a weekly digest.
13. User returns to mark items done, adjust after amendments, use **Ask this award** for cited answers, and re-export.

---

## 4. MVP user stories by epic

### Auth & Organization (AUTH)

| ID | Story |
|---|---|
| AUTH-1 | As an executive director, I want to sign up with an email magic link so that I don't manage another password. |
| AUTH-2 | As an executive director, I want to create an organization with name, time zone, and fiscal year end so that dates and reminders compute correctly. |
| AUTH-3 | As a grants manager, I want to invite teammates by email so that program and finance staff see the awards they own. |
| AUTH-4 | As an executive director, I want exactly two roles — Owner and Member — so that billing and deletion are restricted without a permission matrix. |
| AUTH-5 | As a consultant, I want to belong to and switch between multiple organizations so that client work stays separated. |
| AUTH-6 | As an owner, I want to remove a member and reassign their obligations so that departures don't orphan responsibilities. |

### Upload & Processing (UPL)

| ID | Story |
|---|---|
| UPL-1 | As a grants manager, I want to upload a text-layer PDF or DOCX so that I don't retype an agreement. |
| UPL-2 | As a grants manager, I want to paste raw text so that I can process an award that arrived in an email body. |
| UPL-3 | As a grants manager, I want to be told immediately when a file is a scan with no text layer so that I don't wait for a result that will never come. |
| UPL-4 | As a grants manager, I want a visible processing state with an estimate so that I know whether to wait. |
| UPL-5 | As an executive director, I want to attach multiple documents to one award (agreement plus general terms) so that the register covers all of it. |
| UPL-6 | As a finance leader, I want to view and download the exact source file so that the citation chain is verifiable. |
| UPL-7 | As an owner, I want to delete a document and its extracted data so that we can remove material we shouldn't store. |

### Extraction (EXT)

| ID | Story |
|---|---|
| EXT-1 | As a grants manager, I want award metadata proposed from the document so that I don't key it in. |
| EXT-2 | As a grants manager, I want obligations classified into the standard types so that I can filter by what I care about. |
| EXT-3 | As a finance leader, I want every proposed obligation to carry a verbatim quote and page/section citation so that I can verify it in seconds. |
| EXT-4 | As a program manager, I want a plain-language restatement beside the legal text so that I understand what I have to do. |
| EXT-5 | As a grants manager, I want relative and recurring due rules converted into proposed concrete dates so that I get a calendar, not a reading list. |
| EXT-6 | As a grants manager, I want each item labeled Explicit or Interpreted so that I know what the document states outright versus what was inferred. |
| EXT-7 | As an executive director, I want a confidence band on each item so that I spend review time where it matters. |
| EXT-8 | As a grants manager, I want re-running extraction to never overwrite confirmed items so that my work is never silently lost. |

### Review & Verification (REV)

| ID | Story |
|---|---|
| REV-1 | As a grants manager, I want a one-at-a-time review queue with the source excerpt on screen so that I confirm without switching windows. |
| REV-2 | As a grants manager, I want to confirm, edit-and-confirm, or reject each item so that the register reflects our judgment, not the model's. |
| REV-3 | As a finance leader, I want to mark an item "source confirmation needed" so that ambiguity is visibly parked rather than silently accepted. |
| REV-4 | As a grants manager, I want to add an obligation the extractor missed so that the register is complete even when extraction isn't. |
| REV-5 | As a grants manager, I want to jump from any register row to the highlighted quote in the source so that I can answer "where did this come from?" instantly. |
| REV-6 | As an executive director, I want visible review progress so that I know how much work is left. |
| REV-7 | As a grants manager, I want an audit trail of who confirmed or edited what so that decisions survive turnover. |
| REV-8 | As a grants manager, I want unconfirmed items excluded from exports and reminders so that nothing unreviewed reaches our calendar. |

### Award Workspace (WRK)

| ID | Story |
|---|---|
| WRK-1 | As a grants manager, I want one page per award showing metadata, the confirmed register, and unconfirmed items separately so that state is unambiguous. |
| WRK-2 | As a finance leader, I want to filter by type, owner, status, and date range so that I can see only financial restrictions. |
| WRK-3 | As a program manager, I want to mark an obligation complete with a date and note so that we see what's actually been done. |
| WRK-4 | As a grants manager, I want to edit a confirmed obligation after an amendment so that the register stays current. |
| WRK-5 | As an executive director, I want to assign an owner to each obligation so that accountability is explicit. |
| WRK-6 | As a grants manager, I want to change the period of performance and preview which derived dates shift so that an extension doesn't quietly break the calendar. |

### Dashboard (DASH)

| ID | Story |
|---|---|
| DASH-1 | As an executive director, I want a cross-award view of what's due in 30/60/90 days so that I can run one weekly check. |
| DASH-2 | As a grants manager, I want overdue items surfaced first and visually distinct so that nothing sits unnoticed. |
| DASH-3 | As an executive director, I want a list of awards with performance end and renewal dates so that I can see what's expiring. |
| DASH-4 | As an owner, I want awards flagged when review is incomplete so that half-finished registers don't create false confidence. |
| DASH-5 | As a program manager, I want to filter to items assigned to me so that I see only my work. |

### Ask this award (ASK)

| ID | Story |
|---|---|
| ASK-1 | As a finance leader, I want answers about a specific award with citations so that I can verify them. |
| ASK-2 | As a grants manager, I want the system to say "the document doesn't address this" rather than guess so that I don't act on invention. |
| ASK-3 | As an executive director, I want it to refuse legal, tax, accounting, and compliance determinations and show document language instead so that we don't mistake it for advice. |
| ASK-4 | As a grants manager, I want to turn an answer into a candidate obligation in the review queue so that discoveries become tracked items. |
| ASK-5 | As a grants manager, I want questions scoped to one award so that answers never blend funders. |

### Exports (EXP)

| ID | Story |
|---|---|
| EXP-1 | As a grants manager, I want a CSV of the confirmed register including citations so that I can work in our existing spreadsheet. |
| EXP-2 | As a grants manager, I want an .ics file of dated obligations so that I can import into Google Calendar or Outlook. |
| EXP-3 | As a power user, I want a JSON export of the full award and register so that data is portable. |
| EXP-4 | As a consultant, I want a printable operating plan so that I have a client-ready deliverable. |
| EXP-5 | As a finance leader, I want every export to carry the disclaimer and timestamp so that recipients know what they hold. |
| EXP-6 | As an executive director, I want exports to include only confirmed items by default so that exports are trustworthy. |

### Reminders (REM)

| ID | Story |
|---|---|
| REM-1 | As a program manager, I want email reminders before an obligation is due so that I have time to act. |
| REM-2 | As a grants manager, I want defaults of 30/14/7/1 days plus day-of, overridable per obligation, so that defaults work without configuration. |
| REM-3 | As an executive director, I want a weekly digest across all awards so that I have one recurring touchpoint. |
| REM-4 | As a program manager, I want reminders naming the award, obligation, due date, and source link so that the email is actionable alone. |
| REM-5 | As any user, I want to unsubscribe from digests and mute an award's reminders so that email stays useful. |
| REM-6 | As a grants manager, I want reminders to stop when an item is complete or rejected so that we don't learn to ignore them. |

### Billing (BILL)

| ID | Story |
|---|---|
| BILL-1 | As an executive director, I want a free tier covering one active award with full functionality so that I can prove value before paying. |
| BILL-2 | As an owner, I want hosted card checkout so that I never handle payment details in-app. |
| BILL-3 | As an owner, I want to see plan, award count, and seat count against limits so that I understand what I'm buying. |
| BILL-4 | As an owner, I want cancellation to leave read-only access plus exports so that our data is never held hostage. |
| BILL-5 | As an owner, I want receipts emailed and available in-app so that I can file them. |

### Settings (SET)

| ID | Story |
|---|---|
| SET-1 | As an owner, I want to set org name, time zone, and fiscal year end so that dates and digests land correctly. |
| SET-2 | As an owner, I want org-wide default reminder lead times so that I configure once. |
| SET-3 | As a consultant, I want to upload a logo used on the operating plan so that deliverables look like mine. |
| SET-4 | As any user, I want to update my name, email, and notification preferences so that I control my own inbox. |
| SET-5 | As an owner, I want to export all org data and delete the organization so that we can leave cleanly. |

---

## 5. Acceptance criteria

**AUTH** — Given a valid email, when a magic link is requested, then it is single-use and expires in 15 minutes. Given a user with no org, when they log in, then they are routed to org creation and cannot reach any award route. Given a Member, when they open Billing or Delete Organization, then the action is blocked with an explanation naming the Owner role. Given a consultant in three orgs, when they switch, then no award, document, or register from another org is reachable, including by direct URL. Given a removed member with assigned obligations, when removal completes, then those items show "Unassigned" and appear in a reassignment prompt.

**UPL** — Given a 40 MB / 300-page text-layer PDF, when uploaded, then it is accepted; exceeding either limit is rejected with the specific limit stated. Given a PDF whose extracted text is under 200 characters per page across most pages, when processing begins, then the run halts with "This looks like a scanned document. AwardLens can't read scans yet." Given a supported upload, when processing runs, then the UI shows Queued → Parsing → Extracting → Ready, and p95 time to Ready for a 60-page document is under 4 minutes. Given a processing failure, when the user returns, then the award shows a failed state with retry and no partial candidates. Given a deleted document, when deletion completes, then its file, parsed text, and citing obligations are removed or marked orphaned, and the deletion is recorded in the audit trail.

**EXT** — Given a parsed document, when extraction completes, then every candidate has a verbatim quote present in the source text, a page number, a type from the fixed taxonomy, an Explicit/Interpreted basis, and a confidence band. Given a candidate whose quote cannot be matched to source text, when results are assembled, then it is discarded and never shown. Given a confirmed performance period and a recurring rule, when dates are derived, then one dated instance is generated per period within that window, each labeled Interpreted. Given an obligation with no determinable date, when displayed, then it appears as undated rather than receiving a guessed date. Given re-extraction, when new candidates are produced, then confirmed, edited, and rejected items are preserved and new candidates are added as unreviewed.

**REV** — Given candidates exist, when review opens, then items are ordered by confidence ascending within type and the source excerpt is visible without scrolling at 1280px. Given a candidate, when the user confirms, edits, rejects, or flags it, then status updates immediately, the queue advances, and the last action can be undone. Given an item flagged "source confirmation needed," when exports or reminders generate, then it is excluded and counted as unresolved. Given a manually added obligation, when saved, then basis is "User-entered," a citation or an explicit "no citation" acknowledgment is required, and it is treated as confirmed. Given any register row, when the citation is clicked, then the source viewer opens at the correct page with the quote highlighted. Given any confirm, edit, reject, or delete, when it occurs, then the audit trail records actor, timestamp, and field-level before/after.

**WRK** — Given an award, when the workspace loads, then confirmed and unconfirmed items appear in visually distinct sections with a review-completeness banner. Given active filters, when the URL is copied and reopened, then filter state is restored. Given an obligation marked complete, when saved, then status, completion date, and actor are stored and future reminders are cancelled. Given a change to the performance period, when submitted, then a preview lists every derived date that would shift and nothing changes until confirmed.

**DASH** — Given dated obligations, when the dashboard loads, then Overdue / Next 30 / Next 60 / Next 90 buckets show counts of confirmed items only, computed in the org time zone. Given an award with unreviewed candidates, when it appears anywhere on the dashboard, then it carries a "Review incomplete" indicator. Given the "Assigned to me" filter, when applied, then only the current user's obligations appear.

**ASK** — Given a question, when an answer is produced, then it includes at least one page-and-quote citation from that award's documents. Given a question the documents do not address, when answered, then the response says so and offers no outside inference. Given a determination question ("Is this allowable?", "Are we compliant?"), when answered, then relevant document language is returned, the determination is declined, and the non-advice disclaimer is shown. Given an answer, when "Track this" is selected, then a candidate obligation enters the unreviewed queue with the citation attached.

**EXP** — Given a confirmed register, when CSV is exported, then it contains one row per obligation with: id, award, type, title, restatement, verbatim quote, page, section, due date, recurrence, owner, status, basis, confidence, confirmed by, confirmed at. Given dated confirmed obligations, when .ics is exported, then each event has a stable UID, a date, and a description containing restatement and citation, and imports without error into Google Calendar and Outlook. Given a JSON export, when re-validated, then it round-trips metadata, obligations, citations, and statuses without loss. Given the operating plan, when printed to Letter PDF, then it paginates cleanly with award summary, obligations grouped by type, an owner column, and the disclaimer on first and last pages. Given any export, when generated, then it carries export timestamp, org name, and the standard disclaimer.

**REM** — Given a confirmed dated obligation with an owner, when a lead-time threshold is reached at 08:00 org time, then exactly one email is sent for that threshold. Given an obligation marked complete or rejected, when a later threshold would fire, then no email is sent. Given a digest subscriber, when Monday 08:00 org time arrives, then a digest covering overdue and next-30-day confirmed items is sent. Given an unsubscribe click, when processed, then digests stop within one send cycle while per-obligation reminders remain separately controllable. Given an unconfirmed item, when any reminder job runs, then no reminder is ever generated.

**BILL** — Given a free org at one active award, when a second award is created, then creation is blocked with an upgrade path and existing data stays fully accessible. Given successful checkout, when the webhook arrives, then the plan activates within 60 seconds without re-login. Given cancellation, when the period ends, then the org becomes read-only with exports still available and no data deleted.

**SET** — Given a time zone change, when saved, then dashboard buckets and reminder send times recompute. Given a default lead-time change, when saved, then it applies to obligations created afterward and does not rewrite per-item overrides. Given an org deletion request, when confirmed by typing the org name, then a full JSON export is offered first and deletion completes within 24 hours.

---

## 6. MVP scope boundaries

| IN — MVP | OUT — not in MVP |
|---|---|
| Email magic-link auth; org creation; Owner/Member roles | Complex RBAC, custom roles, per-field permissions, SSO |
| Text-layer PDF, DOCX, pasted text; multi-document awards | OCR of scanned documents or images |
| Fixed obligation taxonomy with citations and confidence | Automated legal, tax, accounting, or compliance determinations |
| Human review queue; confirm/edit/reject/flag; manual add | Real-time collaborative editing, presence, comment threads |
| Award workspace with filters, owners, completion | Full project management: subtasks, dependencies, Gantt |
| Cross-award dashboard with due-date buckets | Grant discovery, funder prospecting, proposal writing |
| Ask this award — scoped, cited, single-award | Generic document chatbot, open-web Q&A, cross-award chat |
| CSV, .ics download, JSON, printable operating plan | Two-way external calendar sync (Google/Outlook), webhooks |
| Email reminders and weekly digest | SMS, Slack, push, in-app notification center |
| Stripe hosted checkout; free tier of one award | Invoicing, POs, multi-currency |
| Responsive web app | Native iOS/Android apps, offline mode |
| Manual data entry and edits | Accounting integrations (QuickBooks, Sage Intacct, Bill.com) |
| Org data export and deletion | Public API, browser extension, Zapier app |
| Per-obligation owner assignment | Fundraising CRM, donor records, contact management |
| Standard disclaimers on screen and in exports | Automated funder communication, report submission, portal filing |

---

## 7. The fastest useful vertical slice

**Slice: paste text → cited deadlines and deliverables → review → CSV + .ics.**

1. Single user, magic link, one hard-coded organization. No invites, no billing, no roles.
2. One input path: **paste text**. PDF upload follows immediately; DOCX after.
3. Extraction limited to **two obligation types** — reporting deadlines and deliverables — plus funder name and period of performance.
4. Every candidate carries a verbatim quote and a character-offset locator mapped to a displayed page/line. Candidates whose quote does not verbatim-match the source are dropped.
5. Review queue with source excerpt beside the candidate; four actions: confirm, edit-and-confirm, reject, flag.
6. Workspace list of confirmed items only.
7. CSV and .ics export, both carrying the disclaimer.

**Deferred inside the slice:** reminders, dashboard, Ask this award, JSON, operating plan, all other obligation types, owners, multi-document.

**Done when** a real grants manager pastes a real award, reviews the candidates, exports CSV and .ics, imports the .ics into their calendar, and reports the register is materially useful. If citations don't survive spot-checking, nothing downstream matters — fix that first.

---

## 8. Trust and safety requirements

Trust is the product. An extraction users cannot verify is worse than none, because it manufactures false confidence.

### 8.1 Uncertainty on three independent axes

| Axis | Values | Meaning | Where shown |
|---|---|---|---|
| **Extraction basis** | Explicit / Interpreted / User-entered | Explicit: the document states this in the quoted text. Interpreted: AwardLens derived it (e.g. "quarterly" → four dates). User-entered: a person added it. | Badge on every item and export column |
| **Confidence** | High / Medium / Low | Certainty about type and content. Never a raw percentage. | Badge; orders the review queue (Low first) |
| **Review status** | Unreviewed / Confirmed / Edited & Confirmed / Rejected / Source confirmation needed | Whether a human accepted it. | Section grouping, filters, export gate |

Rules:
- **Nothing is authoritative until confirmed.** Unconfirmed items never enter exports, .ics files, reminders, or dashboard counts.
- **Every obligation carries a citation.** An item that cannot be cited is not shown.
- **Interpreted items state their inference** — e.g. "Derived from 'quarterly reports due within 30 days of quarter end' and a performance period of 2026-01-01 to 2027-12-31."
- **"Source confirmation needed" is a first-class state**, not a workaround. It stays visible and uncounted until a human resolves it.
- **Absence is never asserted.** Not "there are no branding requirements," but "no branding requirements were found in the documents provided."
- **Re-extraction never overwrites human decisions.** New candidates are additive only.

### 8.2 Required disclaimers

Standard wording, used verbatim everywhere:

> AwardLens helps you organize and track what your award documents say. It is not legal, accounting, tax, or compliance advice, and it does not guarantee that every obligation has been found or correctly interpreted. Always verify against your source documents and your funder.

Placement: a blocking acknowledgment modal on first upload (recorded per user); persistent app footer; an inline line above the confirm action reading "You are confirming this against the source document"; CSV header block, .ics calendar and per-event descriptions, JSON `_disclaimer` field, operating plan first and last pages, reminder email footer; and with every Ask this award answer.

### 8.3 Ask this award guardrails

Answers are grounded only in the current award's documents plus its confirmed register — no general knowledge, no other awards, no web. Every answer cites; if it cannot cite, it says the document does not address the question. Determination questions return relevant document language plus an explicit refusal to determine, pointing to counsel, the auditor, or the program officer. The interface presents it as a lookup tool over one document set — no conversational persona, no memory across awards.

### 8.4 Data handling

Documents are org-scoped; cross-org direct-URL access returns 404, not 403. Files are encrypted at rest and access is logged. Deleting a document deletes its stored file and parsed text; deleting an org offers an export first and completes within 24 hours. Uploaded content is not used to train models — stated in Settings and the privacy policy.

---

## 9. Success metrics for the pilot

Pilot: 15–25 organizations, 8 weeks, hands-on onboarding for the first five.

### The single most important early signal

> **Discovery rate — the share of reviewed awards in which the user confirms at least one obligation they were not already tracking.**

Captured with one in-flow question per confirmed item: "Were you already tracking this?" If AwardLens only restates what users know, it is a nicer spreadsheet and won't sustain a subscription. If it surfaces genuine unknowns, the core promise holds. **Target: ≥ 60% of reviewed awards contain at least one previously untracked obligation.**

| Metric | Definition | Target |
|---|---|---|
| Activation | Orgs completing review of ≥ 1 award | ≥ 70% of signups |
| Time to confirmed register | Upload → last candidate dispositioned, median | ≤ 45 min |
| Citation trust | Confirmed items whose citation spot-checked correct | ≥ 95% |
| Confirmation rate | Candidates confirmed or edited-and-confirmed | ≥ 75% |
| Edit rate | Confirmed items requiring an edit | ≤ 30% |
| Miss rate | Manually added obligations per award | ≤ 2 |
| Export rate | Reviewed awards with ≥ 1 export | ≥ 80% |
| Calendar adoption | Orgs importing .ics into a real calendar | ≥ 50% |
| Second award | Orgs uploading a second award within 30 days | ≥ 50% |
| Reminder utility | Recipients acting within 7 days | ≥ 40% |
| Willingness to pay | Pilot orgs stating they would pay | ≥ 40% |

**Kill/pivot signals:** discovery rate below 30%; edit rate above 50%; second-award rate below 30%.

---

## 10. Non-goals and anti-patterns

**Non-goals.** Being a system of record for grant financials (that is the accounting system). Replacing counsel, the auditor, or the program officer. Serving grantmakers, universities, hospitals, or organizations with compliance departments. Managing pre-award pipeline or proposals. Guaranteeing completeness of extraction.

**Anti-patterns to design against:**

1. **The generic document chatbot.** A box that answers anything about any document commoditizes the product and invites unverifiable advice. Ask this award is a scoped, cited lookup over one award — not an assistant.
2. **Silent auto-confirmation.** No "confirm all," no accepted-by-default, no confirmation-by-inaction. Bulk confirm within one type is allowed only after individually reviewing at least one item of that type.
3. **Compliance scores and green checkmarks.** No "92% compliant," no traffic lights implying legal standing. Status describes *our records* ("12 of 14 obligations confirmed"), never compliance posture.
4. **Unsourced assertions.** Any obligation shown without a citation is a defect.
5. **Confidence theater.** No precise-looking percentages implying calibration we don't have. Bands only.
6. **Creep toward project management.** No subtasks, dependencies, sprints, or Kanban. An obligation has an owner, a date, and a status. That is the model.
7. **Destructive re-processing.** Re-extraction must never overwrite or delete human decisions.
8. **Alarm fatigue.** Reminders stop when items complete or are rejected; digest defaults stay conservative. A user who mutes everything is a product failure.
9. **AI-first framing.** The UI leads with the register and the source document. Extraction is plumbing, not the headline.
10. **Hostage data.** Export is always available, including after cancellation. Cancellation never deletes data.

---

## 11. Open product questions

1. **Amendments.** Should a modification be a new document on the existing award (current assumption), a versioned award, or a distinct object with a diff view? What should happen to derived dates?
2. **OCR demand.** How many real awards arrive as scans? Above ~25% and OCR moves to next-quarter IN, because "we can't read scans" becomes the top conversion leak.
3. **Incorporated-by-reference terms.** Awards routinely incorporate 2 CFR 200 or funder general terms without attaching them. Prompt the user to upload, maintain a library, or scope out anything not in the uploaded text? (MVP assumes the last, stated plainly.)
4. **Funder templates.** Do the same funders recur enough across small nonprofits to justify funder-specific extraction profiles?
5. **Owner identity.** Restrict obligation owners to invited users, or keep free-text names? Free text is faster; invited users make reminders and turnover handoff work.
6. **Turnover handoff.** Is a dedicated handoff pack (register + citations + source docs + open items) a feature people will pay for on its own?
7. **Consultant multi-tenancy.** Is org-switching enough, or do consultants need a client-portfolio view, client-branded exports, and cross-client dashboards? Possibly a separate tier.
8. **Calendar sync.** Is one-time .ics download sufficient, or does staleness force two-way Google/Outlook sync onto the roadmap?
9. **Reminders to non-users.** Should reminders reach people without accounts (board treasurer, subrecipient contact)? Affects auth, deliverability, and pricing.
10. **Pricing shape.** Per active award, per seat, or flat per org? Small nonprofits budget annually and resist per-seat; consultants scale by client count.
11. **Confidence calibration.** Do the bands correlate with actual rejections in pilot data? If not, recalibrate or remove the axis rather than display a misleading signal.
12. **Closeout as a mode.** Closeout has its own workflow (final reports, final drawdown, equipment disposition, retention clock). Filtered view or separate guided flow?
