import "server-only";

import { createGateway } from "@ai-sdk/gateway";
import type { LanguageModel } from "ai";

import { getServerConfig } from "@/lib/env";

/**
 * Single source of truth for model selection.
 *
 * The model id is never hardcoded: it comes from AI_MODEL and is routed through
 * the Vercel AI Gateway, so switching providers is a configuration change rather
 * than a code change. Run `pnpm models:list` to see the ids your gateway key can
 * actually reach before setting it.
 */
export class ModelNotConfiguredError extends Error {
  readonly code = "ai_not_configured";
  constructor() {
    super(
      "No AI model is configured. Set AI_GATEWAY_API_KEY and AI_MODEL, or run with USE_DETERMINISTIC_AI_FIXTURES=true.",
    );
    this.name = "ModelNotConfiguredError";
  }
}

function gatewayProvider() {
  const { ai } = getServerConfig();
  if (!ai.apiKey) throw new ModelNotConfiguredError();
  return createGateway({ apiKey: ai.apiKey });
}

export function getExtractionModel(): LanguageModel {
  const { ai } = getServerConfig();
  if (!ai.model) throw new ModelNotConfiguredError();
  return gatewayProvider()(ai.model);
}

/**
 * The critic and citation auditor can run on a different model so the reviewer
 * is not the same system that produced the claim. Falls back to the main model.
 */
export function getCriticModel(): LanguageModel {
  const { ai } = getServerConfig();
  const id = ai.criticModel ?? ai.model;
  if (!id) throw new ModelNotConfiguredError();
  return gatewayProvider()(id);
}

export function getConfiguredModelId(): string | null {
  return getServerConfig().ai.model ?? null;
}
