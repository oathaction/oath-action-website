/**
 * The AwardLens domain model.
 *
 * These types are the contract shared by the extraction pipeline, the data
 * layer and the UI. They are intentionally free of any storage or AI SDK
 * concerns so they can be used on both the server and the client.
 */

export const OBLIGATION_CATEGORIES = [
  "reporting",
  "financial",
  "deliverable",
  "performance_metric",
  "prior_approval",
  "allowable_cost",
  "restricted_use",
  "communications_branding",
  "procurement",
  "records_retention",
  "data_collection",
  "participant_eligibility",
  "insurance",
  "audit",
  "match_cost_share",
  "subrecipient_oversight",
  "closeout",
  "renewal_continuation",
  "general_compliance",
  "other",
] as const;

export type ObligationCategory = (typeof OBLIGATION_CATEGORIES)[number];

/** Groupings used to organise the register and workspace tabs. */
export type CategoryGroup = "deadlines" | "money" | "programmatic" | "compliance";

interface CategoryMeta {
  label: string;
  group: CategoryGroup;
  description: string;
}

export const CATEGORY_META: Record<ObligationCategory, CategoryMeta> = {
  reporting: {
    label: "Reporting",
    group: "deadlines",
    description: "Narrative, financial or programmatic reports the recipient must submit.",
  },
  financial: {
    label: "Financial",
    group: "money",
    description: "Budget, drawdown, invoicing and financial management requirements.",
  },
  deliverable: {
    label: "Deliverable",
    group: "programmatic",
    description: "A concrete product, service or activity the award pays for.",
  },
  performance_metric: {
    label: "Performance measure",
    group: "programmatic",
    description: "Targets, indicators or outcomes the recipient agreed to achieve.",
  },
  prior_approval: {
    label: "Prior approval",
    group: "compliance",
    description: "Changes that require written funder approval before they happen.",
  },
  allowable_cost: {
    label: "Allowable cost",
    group: "money",
    description: "Costs the award explicitly permits, including any conditions.",
  },
  restricted_use: {
    label: "Restricted use",
    group: "money",
    description: "Costs or activities the award prohibits or restricts.",
  },
  communications_branding: {
    label: "Communications & branding",
    group: "compliance",
    description: "Acknowledgement, logo, publicity and approval-of-materials requirements.",
  },
  procurement: {
    label: "Procurement",
    group: "compliance",
    description: "Purchasing, bidding and vendor selection rules.",
  },
  records_retention: {
    label: "Records retention",
    group: "compliance",
    description: "How long records must be kept and in what form.",
  },
  data_collection: {
    label: "Data collection",
    group: "programmatic",
    description: "Data, evidence or documentation that must be gathered.",
  },
  participant_eligibility: {
    label: "Participant eligibility",
    group: "programmatic",
    description: "Who may be served, and how eligibility must be documented.",
  },
  insurance: {
    label: "Insurance",
    group: "compliance",
    description: "Coverage the recipient must carry and evidence it must provide.",
  },
  audit: {
    label: "Audit",
    group: "compliance",
    description: "Audit thresholds, submissions and access-to-records rights.",
  },
  match_cost_share: {
    label: "Match / cost share",
    group: "money",
    description: "Non-funder contributions required, and how they must be documented.",
  },
  subrecipient_oversight: {
    label: "Subrecipient oversight",
    group: "compliance",
    description: "Monitoring duties when award funds flow to another organisation.",
  },
  closeout: {
    label: "Closeout",
    group: "deadlines",
    description: "Final reports, final invoices, unspent funds and property disposition.",
  },
  renewal_continuation: {
    label: "Renewal / continuation",
    group: "deadlines",
    description: "Dates and conditions for continuing or renewing the award.",
  },
  general_compliance: {
    label: "General compliance",
    group: "compliance",
    description: "Broad certifications and legal requirements incorporated by the award.",
  },
  other: {
    label: "Other",
    group: "compliance",
    description: "Obligations that do not fit an existing category.",
  },
};

export const CATEGORY_GROUP_LABELS: Record<CategoryGroup, string> = {
  deadlines: "Deadlines & reporting",
  money: "Money & restrictions",
  programmatic: "Programme delivery",
  compliance: "Compliance & governance",
};

export const OBLIGATION_PRIORITIES = ["critical", "high", "medium", "low"] as const;
export type ObligationPriority = (typeof OBLIGATION_PRIORITIES)[number];

export const PRIORITY_LABELS: Record<ObligationPriority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

/** Human review lifecycle. Nothing reaches "confirmed" without a person. */
export const REVIEW_STATUSES = [
  "needs_review",
  "confirmed",
  "needs_clarification",
  "not_applicable",
  "archived",
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  needs_review: "Needs review",
  confirmed: "Confirmed",
  needs_clarification: "Needs clarification",
  not_applicable: "Not applicable",
  archived: "Archived",
};

/**
 * How much the extraction had to reason beyond the literal text. Surfaced to
 * the user so "the award says this" is never confused with "we inferred this".
 */
export const INTERPRETATION_LEVELS = ["explicit", "light_interpretation", "uncertain"] as const;
export type InterpretationLevel = (typeof INTERPRETATION_LEVELS)[number];

export const INTERPRETATION_LABELS: Record<InterpretationLevel, string> = {
  explicit: "Explicit in award",
  light_interpretation: "Interpreted",
  uncertain: "Uncertain",
};

/** Outcome of validating an obligation's citations against stored segments. */
export const SOURCE_STATUSES = ["verified", "partial", "unverified"] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];

export const SOURCE_STATUS_LABELS: Record<SourceStatus, string> = {
  verified: "Source verified",
  partial: "Partial source match",
  unverified: "Source confirmation needed",
};

export const LOCATOR_TYPES = ["page", "section", "paragraph"] as const;
export type LocatorType = (typeof LOCATOR_TYPES)[number];

export type AwardSourceType = "pdf" | "docx" | "text" | "sample";

export type ParserStatus =
  | "pending"
  | "parsed"
  | "no_text_layer"
  | "password_protected"
  | "corrupted"
  | "unsupported"
  | "failed";

export const PROCESSING_STAGES = [
  "securing_document",
  "reading_document",
  "identifying_award",
  "finding_obligations",
  "checking_sources",
  "preparing_review",
] as const;
export type ProcessingStage = (typeof PROCESSING_STAGES)[number];

export const PROCESSING_STAGE_LABELS: Record<ProcessingStage, string> = {
  securing_document: "Securing document",
  reading_document: "Reading document",
  identifying_award: "Identifying award details",
  finding_obligations: "Finding obligations",
  checking_sources: "Checking source references",
  preparing_review: "Preparing review",
};

export type ProcessingStatus = "queued" | "running" | "succeeded" | "partial" | "failed";

export type AwardStatus = "processing" | "active" | "failed" | "archived";
export type AwardReviewStatus = "not_started" | "in_progress" | "complete";

export interface Profile {
  id: string;
  email: string;
  fullName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type OrganizationRole = "owner" | "admin" | "member";

export interface OrganizationMember {
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  createdAt: string;
}

export interface Award {
  id: string;
  organizationId: string;
  name: string;
  funder: string | null;
  recipientName: string | null;
  awardNumber: string | null;
  awardAmount: number | null;
  currency: string;
  startDate: string | null;
  endDate: string | null;
  effectiveDate: string | null;
  grantPeriodText: string | null;
  programName: string | null;
  assistanceType: string | null;
  primaryContacts: AwardContact[];
  governingDocuments: string[];
  status: AwardStatus;
  reviewStatus: AwardReviewStatus;
  sourceType: AwardSourceType;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AwardContact {
  name: string | null;
  role: string | null;
  organization: string | null;
  email: string | null;
  phone: string | null;
}

export interface DocumentRecord {
  id: string;
  awardId: string;
  organizationId: string;
  storagePath: string | null;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  contentHash: string;
  parserStatus: ParserStatus;
  parserMessage: string | null;
  pageCount: number | null;
  extractedTextVersion: string;
  createdAt: string;
}

export interface DocumentSegment {
  id: string;
  documentId: string;
  locatorType: LocatorType;
  locatorValue: string;
  heading: string | null;
  text: string;
  sequence: number;
  tokenEstimate: number;
  createdAt: string;
}

export interface ProcessingRun {
  id: string;
  awardId: string;
  documentId: string;
  status: ProcessingStatus;
  stage: ProcessingStage;
  model: string | null;
  promptVersion: string;
  startedAt: string;
  completedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  usageMetadata: UsageMetadata | null;
  createdAt: string;
}

export interface UsageMetadata {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  calls: number;
  stages: Record<string, { durationMs: number; calls: number }>;
}

export interface Obligation {
  id: string;
  awardId: string;
  organizationId: string;
  category: ObligationCategory;
  title: string;
  description: string;
  originalDateText: string | null;
  dueDate: string | null;
  recurrence: string | null;
  internalDueDate: string | null;
  suggestedOwnerRole: string | null;
  assignedUserId: string | null;
  priority: ObligationPriority;
  confidence: number;
  reviewStatus: ReviewStatus;
  interpretationLevel: InterpretationLevel;
  consequence: string | null;
  clarificationQuestion: string | null;
  sourceStatus: SourceStatus;
  notes: string | null;
  /** Competing dates the document states for the same obligation. */
  dateConflicts: DateConflict[];
  origin: "extracted" | "manual" | "critic";
  createdAt: string;
  updatedAt: string;
}

export interface DateConflict {
  dateText: string;
  normalizedDate: string | null;
  locatorType: LocatorType;
  locatorValue: string;
}

export interface ObligationCitation {
  id: string;
  obligationId: string;
  documentSegmentId: string | null;
  locatorType: LocatorType;
  locatorValue: string;
  excerpt: string;
  startOffset: number | null;
  endOffset: number | null;
  /** Similarity of the model's excerpt to the stored segment text, 0-1. */
  matchScore: number;
  createdAt: string;
}

export interface ObligationWithCitations extends Obligation {
  citations: ObligationCitation[];
}

export const REMINDER_OFFSETS = [90, 60, 30, 14, 7, 1] as const;
export type ReminderOffset = (typeof REMINDER_OFFSETS)[number];

export type ReminderStatus = "scheduled" | "sent" | "skipped" | "failed" | "cancelled";

export interface Reminder {
  id: string;
  obligationId: string;
  organizationId: string;
  userId: string;
  offsetDays: number;
  scheduledFor: string;
  sentAt: string | null;
  status: ReminderStatus;
  idempotencyKey: string;
  lastError: string | null;
  createdAt: string;
}

export type PlanId = "demo" | "single_award" | "small_org" | "team";

export interface Subscription {
  id: string;
  organizationId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  plan: PlanId;
  status: "active" | "trialing" | "past_due" | "canceled" | "incomplete";
  periodEnd: string | null;
  /** Single-award packs grant a fixed number of processed awards. */
  awardCredits: number;
  createdAt: string;
  updatedAt: string;
}

export type ExportFormat = "csv" | "ics" | "json" | "print";

export interface ExportRecord {
  id: string;
  awardId: string;
  organizationId: string;
  format: ExportFormat;
  storagePath: string | null;
  generatedBy: string;
  generatedAt: string;
}

export interface AuditEvent {
  id: string;
  organizationId: string;
  userId: string | null;
  eventType: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface NotificationPreferences {
  userId: string;
  organizationId: string;
  enabled: boolean;
  offsets: number[];
  updatedAt: string;
}

/** Conversation history for "Ask this award", scoped to a single award. */
export interface AskExchange {
  id: string;
  awardId: string;
  organizationId: string;
  userId: string;
  question: string;
  answer: string;
  answerType: "answered" | "not_addressed" | "uncertain";
  interpretationLevel: InterpretationLevel;
  citations: AskCitation[];
  suggestedFunderQuestion: string | null;
  createdAt: string;
}

export interface AskCitation {
  locatorType: LocatorType;
  locatorValue: string;
  excerpt: string;
  segmentId: string | null;
}
