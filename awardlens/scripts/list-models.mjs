#!/usr/bin/env node
/**
 * Lists the model ids your AI Gateway key can actually reach.
 *
 * AwardLens never hardcodes a model. Run this, pick an id, and set it as
 * AI_MODEL — that way the configured model is one that verifiably exists for
 * your account rather than one that existed when this code was written.
 *
 *   pnpm models:list
 */

const apiKey = process.env.AI_GATEWAY_API_KEY;

if (!apiKey) {
  console.error(
    "AI_GATEWAY_API_KEY is not set.\n\n" +
      "Create a key at https://vercel.com/dashboard (AI Gateway), then:\n" +
      "  AI_GATEWAY_API_KEY=... pnpm models:list\n",
  );
  process.exit(1);
}

try {
  const { createGateway } = await import("@ai-sdk/gateway");
  const gateway = createGateway({ apiKey });
  const available = await gateway.getAvailableModels();
  const models = available.models ?? [];

  const language = models.filter(
    (model) => !model.modelType || model.modelType === "language",
  );

  if (language.length === 0) {
    console.log("The gateway returned no language models for this key.");
    process.exit(0);
  }

  console.log(`\n${language.length} language models available:\n`);
  for (const model of language) {
    const name = model.name ? ` — ${model.name}` : "";
    console.log(`  ${model.id}${name}`);
  }
  console.log("\nSet one of these as AI_MODEL in your environment, for example:");
  console.log(`  AI_MODEL=${language[0].id}\n`);
} catch (error) {
  console.error("Could not list models:", error instanceof Error ? error.message : error);
  console.error(
    "\nCheck that AI_GATEWAY_API_KEY is valid and that this machine can reach the gateway.",
  );
  process.exit(1);
}
