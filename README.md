# Oath &amp; Action — Website Prototype

**“From spectators to stewards.”**
_Clarity is our duty. Action is our promise._

A complete, dependency-free HTML/CSS prototype for **Oath &amp; Action** — a nonpartisan
civic-media and democracy-reform platform that combines a premium civic magazine, a
public-interest intelligence dashboard, and an action platform. Built around the four
pillars: **Explain → Track → Connect → Act**.

---

## Quick start

No build step, no dependencies. Open `index.html` in a browser, or serve the folder:

```bash
npx http-server .      # or: python3 -m http.server
```

Then visit `http://localhost:8080`.

---

## 1. Site map

```
Oath & Action
│
├── Home (index.html) ............... Hero, pillar pipeline, live tracker widget,
│                                     editorial, explainers, systems map, action cards
│
├── Pillars
│   ├── Explain (explain.html) ...... Explainer library + topic filters + glossary
│   ├── Track (track.html) .......... Live democracy-reform dashboard
│   ├── Connect (connect.html) ...... Systems map + representative lookup + directory
│   └── Act (act.html) .............. Action feed sized to your time + impact stats
│
├── Read / Media
│   ├── Dispatches (dispatches.html)  Newsletter hub / magazine index
│   ├── Article template (article.html)
│   └── Issue template (issue.html) . Issue explainer hub (Redistricting & Fair Maps)
│
├── Data & civic intelligence
│   ├── Reform Tracker template (tracker.html) … 50-state RCV tracker
│   ├── Bill tracker template (bill.html) ……… Single-bill deep page
│   └── Rep scorecard template (scorecard.html)  Nonpartisan legislator profile
│
├── Get involved
│   ├── Toolkit / Resources (toolkit.html) … Resource library + educator kits
│   ├── Jobs / Opportunities (jobs.html) …… Jobs board + fellowships
│   ├── Events / Calendar (events.html) …… Hearings, town halls, deadlines
│   ├── Donate (donate.html) …………………… Giving tiers + transparency
│   └── Contact / Join (contact.html) …… Volunteer form + ways to plug in
│
├── About (about.html) .............. Mission, team, funding & ethics, timeline
│
├── Utility & legal
│   ├── Search results (search.html) … Search mockup w/ filters + pagination
│   ├── Editorial standards (editorial-standards.html) · Privacy (privacy.html)
│   ├── Terms (terms.html) · 404 (404.html)
│   └── Concept Variations (concepts.html)  4 design directions for key sections
│
└── Machine surfaces … sitemap.xml · robots.txt · manifest.webmanifest · humans.txt
                       · JSON-LD (Organization / WebSite / NewsArticle) on every page
```

**Reusable templates** (built so the CMS can stamp out many instances):
`article.html` (any story), `issue.html` (any issue hub), `tracker.html` (any reform
tracker), `bill.html` (any bill), `scorecard.html` (any representative).

---

## 2. Page-by-page layout plan

| Page | Primary job | Key modules |
|---|---|---|
| **Home** | Orient + route in 10 seconds | Hero w/ live reform widget · Explain→Track→Connect→Act process · stats strip · featured editorial (3) · explainer grid · systems-map · tracker preview · action cards · partners · newsletter banner |
| **About** | Build trust | Mission split + pull-quote · nonpartisan guarantees · pillar recap · principles · 6-person team · funding/ethics factbox · org timeline · join CTA |
| **Explain** | Library of mental models | Pillar hero (01) · featured explainer · topic filter chips · 12 explainer cards · explainer formats · glossary teaser · newsletter CTA |
| **Track** | Intelligence dashboard | Dark pillar hero (02) · KPI + chart + meter + donut dashboard · "what we track" · tracker briefs · tracker preview · methodology · Tracker Brief CTA |
| **Connect** | Map power, find your seat | Pillar hero (03) · flagship systems-map SVG · representative lookup (ZIP) · map-your-issue cards · coalition directory · connect-locally cards |
| **Act** | Convert understanding to action | Pillar hero (04) · time/issue personalizer · 9-card action feed · impact stats · priority action banner · personal impact widget · steward quote |
| **Dispatches** | Magazine index + signup | Hero + inline signup · featured lead · topic filter · 9 editorial cards · series/formats · load-more · newsletter banner |
| **Article** | Long-form template | Header + byline + share · hero figure · sticky TOC + prose body · factbox · author bio · take-action cards · related reads |
| **Issue** | Issue explainer hub template | Issue hero + meta · "what's at stake" factbox · the basics (prose) · systems-map · mini tracker · ballot-initiative timeline · related reads · take action |
| **Reform Tracker** | State-by-state data template | Hero + meta · KPI summary · status/region filters · 12-state table · legend · "how a reform moves" timeline · state drill-down · methodology · alerts signup |
| **Toolkit** | Resource library | Hero · resource-type filter · 12 resource cards · featured kit spotlight · educator kits · data/API callout · resources signup |
| **Jobs** | Jobs board mockup | Hero · why-work-here stats · department filter · 10 job cards · fellowships · "how we hire" timeline · EEO statement · talent-network CTA |
| **Contact / Join** | Convert to volunteer | Hero · volunteer form + contact aside · other ways to plug in · FAQ · newsletter |
| **Concepts** | Show range | 4 fully-built concept treatments + usage guidance |

Every interior page opens with a `.page-hero`, uses 5–7 focused sections, and closes with a
newsletter or action CTA. All pages share one injected header + footer.

---

## 3. Design rationale

**The thesis: civic media as an instrument panel.** The brand promise is comprehension *and*
agency, so the design language borrows from three credible worlds — the **editorial broadsheet**
(authority), the **intelligence dashboard** (rigor), and the **engineering schematic**
(the system is knowable). Every page is meant to leave the reader feeling *“I understand the
system / I trust this / I know what to do next.”*

- **Newsprint over white.** The `#DCD9D2` paper base immediately reads as journalism, not SaaS,
  and warms an otherwise data-heavy interface. White is reserved for cards so content "lifts"
  off the page.
- **Red as signal, never decoration.** `#E63946` is used exclusively as a *signal point* — the
  pulsing node, the one thing that moved, the single decisive CTA. Restraint keeps it meaningful
  and avoids partisan/"alarm" aesthetics.
- **Prussian + Verdigris as the civic palette.** Deep navy (institutions, trust) and verdigris
  (the patina of public statues — progress, the long civic project) give a serious, non-tribal
  color story that reads across the political spectrum.
- **Mechanism grid + systems maps.** The recurring dot-grid and node-and-edge SVGs make the
  abstract claim ("you can understand power") *visible*. They're decorative but doctrinal.
- **Typography as hierarchy.** Inter Tight (tight, confident headlines) + Inter (highly legible
  UI/body) + Lora italic (the human, editorial voice for the promise and pull-quotes). The
  Lora line is where the organization "speaks."
- **Strong whitespace + hairline rules.** Premium feel, high readability, and a deliberate
  rejection of cluttered-activist density.
- **Four registers, one spine** (see `concepts.html`): Editorial, Dashboard, Movement, and
  Premium Intelligence — so Read pages, Track, Act, and member surfaces can each feel right
  without fragmenting the brand.

**Engineering rationale (built for portability).** A single `styles.css` token system + a tiny
`main.js` that injects the shared header/footer means markup stays DRY and maps cleanly onto
component frameworks. The class vocabulary (`.card-editorial`, `.widget`, `.tracker`, `.process`,
`.timeline`, `.card-action`…) is a ready-made component inventory for Astro/Next/Webflow/Framer.

---

## 4. Additional feature / page ideas (10+)

1. **Representative scorecards** — per-legislator pages: votes on tracked reforms, money received, attendance, contactability.
2. **Bill tracker pages** — a templated page per bill with status timeline, vote breakdown, and "comment now" hooks.
3. **Personalized "My Stewardship" dashboard** — logged-in feed of your reps, saved issues, action streak, and impact log.
4. **Civic literacy course / "Stewardship 101"** — a guided, gamified path through the core explainers with a completion credential.
5. **Local election & deadline calendar** — ZIP-aware registration deadlines, town halls, hearings, and ballot dates (iCal export).
6. **Ballot-measure explainer generator** — plain-language, nonpartisan breakdowns of each measure on *your* ballot.
7. **"Follow this issue"** — subscribe to an issue and get tracker-movement alerts (the issue pages already tee this up).
8. **Data downloads + public API** — the open dataset and API behind the tracker (teased in the toolkit).
9. **Community / chapters portal** — local node pages, working groups, and an events RSVP system (Connect already gestures at it).
10. **Annual "State of Self-Government" report** — a flagship interactive data feature + printable PDF.
11. **Fact-check & methodology vault** — sources, corrections, and editorial-standards transparency hub.
12. **Audio dispatches / podcast** — narrated explainers for commute/accessibility.
13. **Embeddable widgets** — let partners embed the reform tracker or rep-lookup on their sites.
14. **Funder &amp; partner dashboard** — gated "premium civic intelligence" surface (concept 04).

---

## 5. Automation ideas (per system)

These describe how a production build would wire the prototype to live systems. The static
prototype is structured so each maps onto a real data source cleanly.

- **CMS / Content** — Headless CMS (Sanity/Contentful/Payload) drives `article`, `issue`, and
  `dispatch` templates. Editorial workflow with scheduled publish; auto-generate OG images,
  reading time, and TOC from structured content; LLM-assisted "explain-like-I'm-new" drafts
  reviewed by editors before publish.
- **Newsletter publishing** — On publish, an automation composes the Weekly Dispatch (lead +
  one tracker movement + one action) and pushes to the ESP (Mailchimp/Beehiiv/Customer.io).
  Segment by followed issues/state; A/B subject lines; auto-archive each issue to `dispatches`.
- **Jobs board** — Roles synced from an ATS (Greenhouse/Ashby) via API/webhooks into the
  `card-job` template; auto-expire closed roles; post new roles to the talent-network email and
  social; structured-data (`JobPosting`) for SEO.
- **Reform tracker** — Nightly ingest from **Open States / LegiScan / state feeds**; normalize
  bill status into the four states (Enacted/Active/Stalled/Blocked); recompute momentum scores;
  diff against yesterday to generate "what moved" alerts and tracker briefs; human review queue
  for edge cases.
- **Event calendar** — Aggregate hearings, town halls, and registration deadlines from official
  feeds + partner submissions; geocode by ZIP; expose iCal/Google Calendar subscribe + reminders.
- **Partner directory** — Vetted orgs in a database with a moderated submission form; auto-tag by
  issue/region; periodic link-health and "still active?" checks.
- **Volunteer CRM** — Contact/Join form posts to a CRM (HubSpot/EveryAction/Airtable); double
  opt-in; auto-route by interest + ZIP to the right working group; welcome sequence; track
  actions taken back onto the contact record.
- **Representative lookup** — ZIP/address → districts via **Google Civic Info / Cicero / Census
  geocoder**; cache official + committee data; pre-fill the message/comment composer with the
  correct office and ask.
- **Personalized action recommendations** — Rank the action feed by the user's followed issues,
  state activity, available time, and past actions; surface the highest-leverage open action
  (e.g., an open comment period closing soon) first.
- **Social content generation** — On each publish/tracker movement, auto-draft platform-specific
  posts (carousel from the explainer, a "what moved this week" graphic from tracker data),
  queued to a scheduler (Buffer) for human approval — keeping voice consistent and nonpartisan.

---

## 6. Tech notes

- **Semantic HTML5**, landmark regions, skip-link, visible focus states, `prefers-reduced-motion`
  support, labeled form controls, `aria-hidden` on decorative SVG / `aria-label` on meaningful art.
- **WCAG 2.1 AA verified** — audited with **axe-core** across all 23 pages: **0 violations**
  (color-contrast, heading order, names/roles, landmarks, best-practice). The palette carries
  dedicated AA text tokens (`--red-ink`, `--verdigris-ink`, darkened `--stone`, `--red-deep` for
  white-on-red buttons) so brand color stays vivid as a *signal* while text stays legible; the
  brand `--pillar-red` is reserved for graphics, dots, and large accents.
- **Shareable previews** — Open Graph + Twitter Card meta on every page, a branded 1200×630
  `assets/og-cover.png`, an inline-SVG favicon, and a `theme-color`. _(Prototype uses a relative
  `og:image` path; set an absolute URL + per-page `canonical` in production.)_
- **Print stylesheet** (`@media print`) tuned for the Article/Issue templates — drops chrome and
  CTAs, prints ink-on-white, and avoids breaking figures/cards across pages.
- **Article TOC scrollspy** highlights the section you're reading; on-brand **404** page.
- **Discoverability** — `sitemap.xml`, `robots.txt`, a `manifest.webmanifest` (installable PWA
  basics), `humans.txt`, per-page `canonical` links, and **JSON-LD structured data**
  (`NGO`/Organization sitewide, `WebSite` + `SearchAction` on home, `NewsArticle` on the article).
  _(Domain `https://oathandaction.org` is a placeholder — swap at deploy.)_
- **Global UI** — reusable **breadcrumb** and **pagination** components, a **back-to-top** button,
  a privacy **consent banner** (remembers choice in `localStorage`), and a **copy-to-clipboard**
  helper (`[data-copy]`), all dependency-free in `main.js`/`styles.css`.
- **CSS variables** for the full token system (color, type scale, spacing, radius, motion) in
  `assets/css/styles.css` — theming/retheming is a single-file change.
- **One small vanilla JS file** (`assets/js/main.js`) injects the shared header/footer (single
  source of truth), runs the mobile nav, scroll reveals, stat count-ups, filter chips, and demo
  form handling. No frameworks, no external JS dependencies. Fonts via Google Fonts only.
- **Responsive** from ~360px up; grids/process/dashboard/table all collapse gracefully; tables
  scroll on small screens.
- **Portability** — clear section comments, a named component vocabulary, and DRY layout make
  conversion to Astro/Next/Webflow/Framer straightforward (each `.card-*`/`.widget`/template
  becomes a component; the nav/footer model becomes a layout).

## File structure

```
.
├── index.html · about.html · explain.html · track.html · connect.html · act.html
├── dispatches.html · article.html · issue.html · tracker.html · bill.html · scorecard.html
├── toolkit.html · jobs.html · events.html · donate.html · contact.html
├── search.html · editorial-standards.html · privacy.html · terms.html
├── concepts.html · 404.html
├── sitemap.xml · robots.txt · manifest.webmanifest · humans.txt
├── assets/
│   ├── css/styles.css      # design system (tokens + all components + print)
│   ├── js/main.js          # header/footer injection + interactions + scrollspy + global UI
│   └── og-cover.png        # 1200×630 social share image
└── README.md
```