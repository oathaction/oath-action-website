/**
 * Client-safe constants for the Ask panel.
 *
 * Kept out of `ask.ts` deliberately: that module reaches the AI SDK and the
 * server config, and importing it from a client component would drag
 * server-only code into the browser bundle.
 */
export const SUGGESTED_QUESTIONS = [
  "When is the final report due?",
  "Does this award require prior approval for budget changes?",
  "Can this grant pay for staff travel?",
  "Are indirect costs addressed?",
  "What data must we collect about participants?",
  "What records must we retain, and for how long?",
  "Is there a match or cost-share requirement?",
  "How must we acknowledge the funder in our materials?",
] as const;
