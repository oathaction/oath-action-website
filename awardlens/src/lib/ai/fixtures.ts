import type { ObligationCategory, ObligationPriority } from "@/lib/domain/types";
import { findDatesInText } from "@/lib/domain/dates";
import type { SegmentInput } from "@/lib/documents/segment";
import type { ExtractedAwardProfile, ObligationCandidate } from "./schemas";

/**
 * Deterministic extraction (USE_DETERMINISTIC_AI_FIXTURES=true).
 *
 * This is not a canned response. It is a rule-based extractor that reads the
 * document actually supplied and quotes it verbatim, so:
 *   - the app is fully usable and demoable with no API key and no cost,
 *   - end-to-end tests are stable and run in CI without a live provider,
 *   - the real citation-validation path is exercised rather than bypassed —
 *     these excerpts are genuine sentences and must pass the same auditing a
 *     model's output does.
 *
 * It is intentionally more literal and less complete than a model. Its recall on
 * unusual wording is lower, which is the honest trade for determinism.
 */

interface ObligationRule {
  id: string;
  category: ObligationCategory;
  priority: ObligationPriority;
  /** Must match for the rule to fire. */
  pattern: RegExp;
  /** Blocks the rule when present — used to keep definitions and recitals out. */
  exclude?: RegExp;
  label: string;
  ownerRole: string;
  leadDays: number | null;
  confidence: number;
}

/** Ordered most specific first; the first rule that matches a sentence wins. */
const RULES: ObligationRule[] = [
  {
    id: "prior-approval",
    category: "prior_approval",
    priority: "critical",
    pattern: /\b(prior|advance)\s+(written\s+)?(approval|consent|authorization|authorisation)\b/i,
    label: "Prior funder approval required",
    ownerRole: "Executive director",
    leadDays: 30,
    confidence: 0.84,
  },
  {
    id: "match",
    category: "match_cost_share",
    priority: "critical",
    pattern: /\b(cost[- ]shar\w*|matching (funds?|requirement|contribution)|non-federal share|in-kind (match|contribution))\b/i,
    label: "Match / cost-share requirement",
    ownerRole: "Finance lead",
    leadDays: 30,
    confidence: 0.82,
  },
  {
    id: "final-report",
    category: "closeout",
    priority: "critical",
    pattern: /\bfinal\s+(narrative\s+|financial\s+|performance\s+|project\s+)?report\b/i,
    label: "Final report",
    ownerRole: "Grants manager",
    leadDays: 45,
    confidence: 0.88,
  },
  {
    id: "unexpended-funds",
    category: "closeout",
    priority: "high",
    pattern: /\b(unexpended|unspent|unobligated)\b[^.;]{0,40}\bfunds?\b|\breturn\b[^.;]{0,30}\b(funds|balance)\b|\brefund\b[^.;]{0,30}\bfunds?\b/i,
    label: "Return of unexpended funds",
    ownerRole: "Finance lead",
    leadDays: 45,
    confidence: 0.8,
  },
  {
    id: "final-invoice",
    category: "closeout",
    priority: "high",
    pattern: /\bfinal (invoice|billing|request for (payment|reimbursement))\b/i,
    label: "Final invoice",
    ownerRole: "Finance lead",
    leadDays: 30,
    confidence: 0.79,
  },
  {
    id: "closeout",
    category: "closeout",
    priority: "high",
    pattern: /\b(close[- ]?out|liquidat\w+)\b/i,
    label: "Closeout requirement",
    ownerRole: "Finance lead",
    leadDays: 45,
    confidence: 0.78,
  },
  {
    id: "audit",
    category: "audit",
    priority: "high",
    pattern: /\b(single audit|audit report|independent audit|audited financial statements|right to audit|access to records)\b/i,
    label: "Audit requirement",
    ownerRole: "Finance lead",
    leadDays: 60,
    confidence: 0.8,
  },
  {
    id: "retention",
    category: "records_retention",
    priority: "medium",
    pattern: /\b(retain|retention|preserve|maintain)\b[^.;]{0,80}\b(records|documentation|books|files)\b|\brecords?\b[^.;]{0,40}\b(retained|retention)\b/i,
    label: "Records retention",
    ownerRole: "Finance lead",
    leadDays: 7,
    confidence: 0.79,
  },
  {
    id: "advance-review",
    category: "communications_branding",
    priority: "medium",
    pattern: /\b(before|prior to)\b[^.;]{0,40}\b(release|publication|distribution|issuance)\b|\badvance (review|approval|copy)\b|\bsubmit\b[^.;]{0,40}\bfor (review|approval)\b[^.;]{0,40}\b(release|publish|announce)/i,
    label: "Advance review of public materials",
    ownerRole: "Communications lead",
    leadDays: 10,
    confidence: 0.77,
  },
  {
    id: "branding",
    category: "communications_branding",
    priority: "medium",
    pattern: /\b(acknowledg\w+|credit|logo|trademark|press release|public(ity|ation)|announce\w*)\b[^.;]{0,80}\b(funder|foundation|grant|support|award|program)\b|\b(logo|acknowledgement)\b/i,
    label: "Acknowledgement and branding",
    ownerRole: "Communications lead",
    leadDays: 7,
    confidence: 0.74,
  },
  {
    id: "restricted",
    category: "restricted_use",
    priority: "high",
    pattern: /\b(shall not|may not|must not|prohibited|unallowable|not be used|no funds)\b[^.;]{0,90}\b(used|use|expend|pay|purchase|cost)\b|\b(unallowable costs?|prohibited (use|activities))\b/i,
    label: "Restricted use of funds",
    ownerRole: "Finance lead",
    leadDays: null,
    confidence: 0.81,
  },
  {
    id: "indirect",
    category: "financial",
    priority: "medium",
    pattern: /\b(indirect costs?|administrative (rate|costs?)|de minimis rate|overhead)\b/i,
    label: "Indirect cost treatment",
    ownerRole: "Finance lead",
    leadDays: null,
    confidence: 0.77,
  },
  {
    id: "budget-revision",
    category: "prior_approval",
    priority: "high",
    pattern: /\b(budget (revision|modification|amendment|reallocation)|reallocat\w+|transfer .{0,25}between .{0,25}(categories|line items))\b/i,
    label: "Budget revision approval",
    ownerRole: "Finance lead",
    leadDays: 30,
    confidence: 0.8,
  },
  {
    id: "subrecipient",
    category: "subrecipient_oversight",
    priority: "high",
    pattern: /\b(subrecipient|subaward|subcontract\w*|pass[- ]through)\b/i,
    label: "Subrecipient oversight",
    ownerRole: "Grants manager",
    leadDays: 21,
    confidence: 0.76,
  },
  {
    id: "procurement",
    category: "procurement",
    priority: "medium",
    pattern: /\b(procure\w*|competitive (bid|quote|process)|solicit\w+ .{0,20}bids|purchasing (policy|procedures))\b/i,
    label: "Procurement rules",
    ownerRole: "Operations lead",
    leadDays: 14,
    confidence: 0.75,
  },
  {
    id: "insurance",
    category: "insurance",
    priority: "medium",
    pattern: /\b(insurance|liability coverage|certificate of insurance|indemnif\w+)\b/i,
    label: "Insurance requirement",
    ownerRole: "Operations lead",
    leadDays: 21,
    confidence: 0.76,
  },
  {
    id: "eligibility",
    category: "participant_eligibility",
    priority: "medium",
    pattern: /\b(eligib\w+)\b[^.;]{0,80}\b(participant|client|beneficiar\w+|individual|household|student|resident)\b|\bincome (eligib|verif)\w+/i,
    label: "Participant eligibility",
    ownerRole: "Programme manager",
    leadDays: 14,
    confidence: 0.74,
  },
  {
    id: "performance",
    category: "performance_metric",
    priority: "high",
    pattern: /\b(performance (measure|indicator|target|metric)s?|outcome (measure|target)s?|shall serve (at least|no fewer)|target of)\b/i,
    label: "Performance measure",
    ownerRole: "Programme manager",
    leadDays: 21,
    confidence: 0.79,
  },
  {
    id: "data",
    category: "data_collection",
    priority: "medium",
    pattern: /\b(collect|track|document|record)\b[^.;]{0,60}\b(data|demographic\w*|attendance|outcomes?|participants?)\b/i,
    label: "Data collection",
    ownerRole: "Programme manager",
    leadDays: 14,
    confidence: 0.73,
  },
  {
    id: "reporting",
    category: "reporting",
    priority: "high",
    pattern: /\b(submit|provide|deliver|furnish|file)\b[^.;]{0,90}\b(report|statement|SF-?425|narrative|financial report|progress report)\b|\b(quarterly|annual|monthly|semi-?annual) (narrative |financial |progress |programmatic )?report\b/i,
    label: "Report submission",
    ownerRole: "Grants manager",
    leadDays: 21,
    confidence: 0.85,
  },
  {
    id: "renewal",
    category: "renewal_continuation",
    priority: "medium",
    pattern: /\b(renew\w*|continuation (application|request|award)|subsequent year funding|reapply)\b/i,
    label: "Renewal / continuation",
    ownerRole: "Executive director",
    leadDays: 60,
    confidence: 0.75,
  },
  {
    id: "deliverable",
    category: "deliverable",
    priority: "medium",
    pattern: /\b(shall (provide|deliver|conduct|operate|implement|complete)|will (provide|deliver|conduct|operate|implement))\b/i,
    label: "Programme deliverable",
    ownerRole: "Programme manager",
    leadDays: 30,
    confidence: 0.72,
  },
  {
    id: "financial-mgmt",
    category: "financial",
    priority: "medium",
    pattern: /\b(separate account|segregat\w+ (funds|accounting)|financial management system|generally accepted accounting|drawdown|reimburse\w*|invoice)\b/i,
    label: "Financial management",
    ownerRole: "Finance lead",
    leadDays: null,
    confidence: 0.76,
  },
  {
    id: "compliance",
    category: "general_compliance",
    priority: "low",
    pattern: /\b(comply with|in compliance with|subject to)\b[^.;]{0,80}\b(2 CFR|OMB|Uniform Guidance|regulations?|applicable laws?|handbook|policies)\b/i,
    label: "General compliance",
    ownerRole: "Executive director",
    leadDays: null,
    confidence: 0.72,
  },
];

/** Sentences that impose nothing on the recipient. */
const BOILERPLATE = /^(whereas|now,? therefore|this agreement|in witness whereas|in witness whereof|\W*signature|by:|title:|date:)/i;
const DEFINITION = /\b(means|shall mean|is defined as|refers to)\b/i;

export function splitSentences(text: string): { text: string; index: number }[] {
  const results: { text: string; index: number }[] = [];
  // Split on sentence enders and hard line breaks, keeping list markers attached.
  const parts = text.split(/(?<=[.;:!?])\s+(?=[A-Z(\d"“])|\n+/g);
  let cursor = 0;
  for (const part of parts) {
    const index = text.indexOf(part, cursor);
    if (index >= 0) cursor = index + part.length;
    const trimmed = part.trim();
    if (trimmed) results.push({ text: trimmed, index: index >= 0 ? index : cursor });
  }
  return results;
}

const RELATIVE_TIMING =
  /\b(?:within|no later than|not later than|on or before|by the|at least)\s+[^.;]{3,70}/i;
const RECURRENCE =
  /\b(quarterly|annually|annual|monthly|semi-?annually|semi-?annual|each quarter|every quarter|each year|per year)\b/i;

/**
 * Pulls the actual duty out of a requirement sentence.
 *
 * Rule labels alone are too generic: a federal award can state a dozen separate
 * things under "Report submission", and a register showing that title twelve
 * times is unusable even when the underlying items are genuinely distinct.
 * Naming each one after the obligation's own verb phrase — "Submit quarterly
 * financial reports" — makes the register scannable and keeps the titles honest,
 * because the words come from the document.
 */
const ACTION_PHRASE =
  /\b(?:shall|must|will|is required to|are required to|agrees to)\s+((?:not\s+)?[A-Za-z][\w-]*(?:\s+[\w'’-]+){1,6})/i;

const TRAILING_FUNCTION_WORDS =
  /\s+(?:to|the|a|an|of|for|in|on|at|by|with|and|or|that|which|from|as|its|their|any|all|such|no|less|more|later|than)$/i;

export function actionTitle(sentence: string): string | null {
  const match = ACTION_PHRASE.exec(sentence);
  if (!match) return null;

  let phrase = match[1].replace(/\s+/g, " ").trim();
  // Strip dangling function words left by the fixed-width capture.
  for (let i = 0; i < 4; i += 1) {
    const trimmed = phrase.replace(TRAILING_FUNCTION_WORDS, "");
    if (trimmed === phrase) break;
    phrase = trimmed;
  }
  phrase = phrase.replace(/[,;:.]+$/, "").trim();

  if (phrase.split(" ").length < 2 || phrase.length < 8) return null;
  if (phrase.length > 68) phrase = `${phrase.slice(0, 65).replace(/\s+\S*$/, "")}…`;

  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

function toTitle(rule: ObligationRule, sentence: string): string {
  const recurrence = RECURRENCE.exec(sentence)?.[1];
  if (rule.id === "reporting") {
    const kind = /financial|fiscal|SF-?425/i.test(sentence)
      ? "financial report"
      : /narrative|programmatic|progress|performance/i.test(sentence)
        ? "narrative report"
        : "report";
    if (recurrence) {
      const cadence = recurrence.toLowerCase().replace(/^each |^every /, "").replace(/ly$/, "ly");
      return `${cadence.charAt(0).toUpperCase()}${cadence.slice(1)} ${kind}`;
    }
    return kind.charAt(0).toUpperCase() + kind.slice(1);
  }
  // Prefer the document's own phrasing; fall back to the rule's generic label.
  const derived = actionTitle(sentence);
  if (derived) return derived;

  if (recurrence && (rule.category === "financial" || rule.category === "data_collection")) {
    return `${rule.label} (${recurrence.toLowerCase()})`;
  }
  return rule.label;
}

/** Cues that a date following them is a deadline rather than a mention. */
const DUE_CUE = /\b(due|no later than|not later than|on or before|by no later than|submitted by|delivered by|received by|deadline)\b/i;

/**
 * Dates that describe the award's own term rather than a deadline. A grant
 * running "through February 28, 2027" does not make 28 February a due date, and
 * treating it as one would put a deadline in someone's calendar that the
 * document never set.
 */
const PERIOD_CONTEXT = /\b(period|term|through|ending|ends?|expires?|commenc\w+|beginning|between|from)\b[^.;]{0,24}$/i;

export function selectDueDate(
  sentence: string,
  dates: { iso: string; index: number }[],
): string | null {
  if (dates.length === 0) return null;

  const cue = DUE_CUE.exec(sentence);
  if (!cue) return null;

  for (const date of dates) {
    if (date.index <= (cue.index ?? 0)) continue;
    const preceding = sentence.slice(Math.max(0, date.index - 40), date.index);
    if (PERIOD_CONTEXT.test(preceding)) continue;
    return date.iso;
  }

  return null;
}

function buildDescription(rule: ObligationRule, sentence: string): string {
  const clean = sentence.replace(/\s+/g, " ").trim();
  const body = clean.length > 320 ? `${clean.slice(0, 317).trimEnd()}…` : clean;
  return `The award states: ${body}`;
}

export function deterministicObligations(segments: SegmentInput[]): ObligationCandidate[] {
  const candidates: ObligationCandidate[] = [];
  const seen = new Set<string>();

  for (const segment of segments) {
    for (const sentence of splitSentences(segment.text)) {
      const text = sentence.text;
      if (text.length < 45 || text.length > 900) continue;
      if (BOILERPLATE.test(text)) continue;
      if (DEFINITION.test(text) && !/\b(shall|must)\b/i.test(text)) continue;

      const rule = RULES.find(
        (candidate) => candidate.pattern.test(text) && !candidate.exclude?.test(text),
      );
      if (!rule) continue;

      const key = `${rule.id}|${text.slice(0, 60).toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const dates = findDatesInText(text);
      const relative = RELATIVE_TIMING.exec(text)?.[0]?.trim() ?? null;
      const recurrence = RECURRENCE.exec(text)?.[1]?.toLowerCase() ?? null;
      const explicit = /\b(shall|must|is required to|are required to|will be required)\b/i.test(text);
      const dueDate = selectDueDate(text, dates);

      candidates.push({
        category: rule.category,
        title: toTitle(rule, text),
        description: buildDescription(rule, text),
        originalDateText: relative ?? dates[0]?.text ?? null,
        normalizedDueDate: dueDate,
        recurrence,
        suggestedInternalLeadDays: rule.leadDays,
        suggestedOwnerRole: rule.ownerRole,
        priority: rule.priority,
        confidence: explicit ? rule.confidence : Math.max(0.4, rule.confidence - 0.18),
        interpretationLevel: explicit ? "explicit" : "light_interpretation",
        consequence: null,
        clarificationQuestion:
          !dates.length && !relative && rule.category === "reporting"
            ? "The document does not state when this report is due. What deadline applies?"
            : null,
        citations: [
          {
            segmentId: segment.id,
            locatorType: segment.locatorType,
            locatorValue: segment.locatorValue,
            excerpt: text.slice(0, 590),
          },
        ],
      });

      if (candidates.length >= 80) return candidates;
    }
  }

  return candidates;
}

const GRANT_SIGNALS =
  /\b(grant|award|grantee|recipient|funder|foundation|subaward|cooperative agreement|period of performance|notice of award)\b/gi;

function firstMatch(text: string, pattern: RegExp): string | null {
  const match = pattern.exec(text);
  return match ? (match[1] ?? match[0]).trim() : null;
}

export function deterministicProfile(segments: SegmentInput[]): ExtractedAwardProfile {
  const head = segments.slice(0, 4).map((segment) => segment.text).join("\n\n");
  const all = segments.map((segment) => segment.text).join("\n\n");

  const signalCount = (all.match(GRANT_SIGNALS) ?? []).length;
  const isGrantDocument = signalCount >= 6;

  // Funders identify themselves in several ways: a labelled field, a party
  // clause, or an all-caps letterhead on the first page. The letterhead case is
  // the most common in real award letters, so the organisation-suffix match is
  // case-insensitive and tolerates a leading article in the party clause.
  const funder =
    firstMatch(head, /\b(?:Funder|Grantor|Awarding Agency|Foundation)\s*:\s*([^\n]{3,80})/i) ??
    firstMatch(head, /\bbetween\s+(?:the\s+)?([A-Z][^,\n(]{3,70}?)\s*[(,]/) ??
    firstMatch(
      head,
      /^\s*((?:[A-Z][\w'&.-]*\s+){0,5}(?:FOUNDATION|TRUST|FUND|AGENCY|DEPARTMENT|INSTITUTE|ENDOWMENT|CHARITIES|CORPORATION))\s*$/im,
    ) ??
    firstMatch(
      head,
      /^([A-Za-z][A-Za-z .,'&-]{4,60}(?:Foundation|Trust|Fund|Agency|Department|Institute|Endowment))\b/m,
    );

  const recipientName =
    firstMatch(head, /\b(?:Grantee|Recipient|Subrecipient|Organization)\s*:\s*([^\n]{3,80})/i) ??
    firstMatch(head, /\band\s+([A-Z][^,\n]{3,70}?)\s*\(\s*"?(?:the\s+)?(?:Grantee|Recipient)/i);

  const awardNumber = firstMatch(
    all,
    /\b(?:award|grant|agreement|contract)\s*(?:no\.?|number|#|id)\s*:?\s*([A-Z0-9][A-Z0-9\-./]{3,24})/i,
  );

  // The award total is the largest figure stated near award language, which is
  // more reliable than position alone when budgets are itemised.
  let awardAmount: number | null = null;
  for (const match of all.matchAll(/\$\s?([\d,]+(?:\.\d{2})?)/g)) {
    const context = all.slice(Math.max(0, (match.index ?? 0) - 90), (match.index ?? 0) + 60);
    if (!/\b(award|grant|total|amount|sum|not to exceed|shall pay|funding)\b/i.test(context)) continue;
    const value = Number(match[1].replace(/,/g, ""));
    if (!Number.isFinite(value)) continue;
    awardAmount = awardAmount === null ? value : Math.max(awardAmount, value);
  }

  const periodText = firstMatch(
    all,
    /\b(?:period of performance|grant period|project period|term of this (?:agreement|grant))\b[^.\n]{0,120}/i,
  );
  const periodDates = periodText ? findDatesInText(periodText) : [];
  let startDate = periodDates[0]?.iso ?? null;
  let endDate = periodDates[1]?.iso ?? null;

  if (!startDate || !endDate) {
    const throughLine = firstMatch(
      all,
      /\b\w[^.\n]{0,60}\b(?:through|to|until|ending)\b[^.\n]{0,60}/i,
    );
    const fallback = throughLine ? findDatesInText(throughLine) : [];
    startDate ??= fallback[0]?.iso ?? null;
    endDate ??= fallback[1]?.iso ?? null;
  }

  const governingDocuments = [
    ...new Set(
      (all.match(/\b\d+\s+CFR\s+(?:Part\s+)?\d+\b|\bExhibit\s+[A-Z]\b|\bAttachment\s+[A-Z0-9]\b|\b(?:Grantee|Grant)\s+Handbook\b/gi) ?? []).map(
        (value) => value.trim(),
      ),
    ),
  ].slice(0, 12);

  const citations = segments.slice(0, 2).map((segment) => ({
    segmentId: segment.id,
    locatorType: segment.locatorType,
    locatorValue: segment.locatorValue,
    excerpt: segment.text.slice(0, 260),
  }));

  return {
    awardName:
      firstMatch(head, /\b(?:Project|Program(?:me)?|Award)\s+(?:Title|Name)\s*:\s*([^\n]{3,90})/i) ??
      null,
    funder,
    recipientName,
    awardNumber,
    awardAmount,
    currency: awardAmount !== null ? "USD" : null,
    effectiveDate: startDate,
    startDate,
    endDate,
    grantPeriodText: periodText,
    programName: firstMatch(head, /\b(?:Program(?:me)?)\s*:\s*([^\n]{3,80})/i),
    assistanceType: firstMatch(
      all,
      /\b(?:CFDA|Assistance Listing)\s*(?:No\.?|Number)?\s*:?\s*(\d{2}\.\d{3})/i,
    ),
    primaryContacts: [],
    governingDocuments,
    isGrantDocument,
    documentTypeNote: isGrantDocument
      ? null
      : "This does not read like a grant or award document. AwardLens found very little award language in it.",
    citations,
  };
}
