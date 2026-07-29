import "server-only";

import { z } from "zod";

/**
 * AwardLens runs in graded modes so the application is fully operable with no
 * external credentials (local demo / CI) and progressively upgrades as real
 * services are configured. Nothing here is inlined into the client bundle;
 * `publicConfig` below is the only browser-visible surface.
 */

const optionalString = z
  .string()
  .trim()
  .min(1)
  .optional()
  .catch(undefined);

const rawSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().optional().catch(undefined),

  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional().catch(undefined),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  SUPABASE_STORAGE_BUCKET: optionalString,
  DATABASE_URL: optionalString,

  AI_GATEWAY_API_KEY: optionalString,
  AI_MODEL: optionalString,
  AI_CRITIC_MODEL: optionalString,

  STRIPE_SECRET_KEY: optionalString,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: optionalString,
  STRIPE_SINGLE_AWARD_PRICE_ID: optionalString,
  STRIPE_SMALL_ORG_PRICE_ID: optionalString,
  STRIPE_TEAM_PRICE_ID: optionalString,

  RESEND_API_KEY: optionalString,
  EMAIL_FROM: optionalString,

  CRON_SECRET: optionalString,
  AUTH_SECRET: optionalString,

  DEVELOPMENT_BILLING_MODE: optionalString,
  USE_DETERMINISTIC_AI_FIXTURES: optionalString,
  ALLOW_LOCAL_STORE: optionalString,
});

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export type StorageMode = "postgres" | "local";
export type AiMode = "live" | "fixtures";
export type BillingMode = "stripe" | "development";
export type EmailMode = "resend" | "console";

export interface ServerConfig {
  isProduction: boolean;
  appUrl: string;
  storageMode: StorageMode;
  aiMode: AiMode;
  billingMode: BillingMode;
  emailMode: EmailMode;
  supabase: {
    url?: string;
    anonKey?: string;
    serviceRoleKey?: string;
    bucket: string;
  };
  ai: {
    apiKey?: string;
    model?: string;
    criticModel?: string;
  };
  stripe: {
    secretKey?: string;
    publishableKey?: string;
    webhookSecret?: string;
    prices: {
      singleAward?: string;
      smallOrg?: string;
      team?: string;
    };
  };
  email: {
    apiKey?: string;
    from: string;
  };
  cronSecret?: string;
  authSecret?: string;
  /** Postgres connection string. Its presence selects the Postgres adapter. */
  databaseUrl?: string;
  /** Non-fatal configuration problems worth surfacing to an operator. */
  warnings: string[];
}

let cached: ServerConfig | null = null;

export function getServerConfig(): ServerConfig {
  if (cached) return cached;

  const parsed = rawSchema.parse(process.env);
  const isProduction = process.env.NODE_ENV === "production";
  const warnings: string[] = [];

  const supabaseConfigured = Boolean(
    parsed.NEXT_PUBLIC_SUPABASE_URL &&
      parsed.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      parsed.SUPABASE_SERVICE_ROLE_KEY,
  );

  // storageMode reports the adapter the application ACTUALLY uses, never what
  // the environment merely hints at. DATABASE_URL is the switch, because it is
  // the variable the adapter genuinely reads. Reporting "Postgres" for a
  // configuration that still wrote to a JSON file would turn a documented
  // limitation into a false assurance that row-level security was protecting
  // an operator's tenants.
  const storageMode: StorageMode = parsed.DATABASE_URL ? "postgres" : "local";

  if (supabaseConfigured && !parsed.DATABASE_URL) {
    warnings.push(
      "Supabase API credentials are set but DATABASE_URL is not, so AwardLens is still using the local file store. Set DATABASE_URL to your project's Postgres connection string (Project settings → Database) to persist data properly.",
    );
  }

  // Fixture mode is the default whenever a live model cannot actually be called.
  const fixturesRequested = readBoolean(parsed.USE_DETERMINISTIC_AI_FIXTURES, true);
  const canCallModel = Boolean(parsed.AI_GATEWAY_API_KEY && parsed.AI_MODEL);
  const aiMode: AiMode = fixturesRequested || !canCallModel ? "fixtures" : "live";

  if (!fixturesRequested && !canCallModel) {
    warnings.push(
      "Live AI was requested but AI_GATEWAY_API_KEY and AI_MODEL are not both set. Falling back to deterministic fixtures. Run `pnpm models:list` to see model IDs available to your gateway key.",
    );
  }

  const stripeConfigured = Boolean(parsed.STRIPE_SECRET_KEY && parsed.STRIPE_WEBHOOK_SECRET);
  const developmentBillingRequested = readBoolean(parsed.DEVELOPMENT_BILLING_MODE, !isProduction);
  const billingMode: BillingMode =
    stripeConfigured && !developmentBillingRequested ? "stripe" : "development";

  if (isProduction && billingMode === "development") {
    warnings.push(
      "Billing is running in DEVELOPMENT mode in a production build. Entitlements are granted without payment. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET and set DEVELOPMENT_BILLING_MODE=false before charging real customers.",
    );
  }

  const emailMode: EmailMode = parsed.RESEND_API_KEY ? "resend" : "console";

  if (isProduction && storageMode === "local" && !readBoolean(parsed.ALLOW_LOCAL_STORE, false)) {
    warnings.push(
      "Running a production build on the ephemeral local store. Data will not survive a redeploy or a scale event, and a crash on one instance can lose another instance's data. Set ALLOW_LOCAL_STORE=true only to acknowledge this is an intentional demo deployment.",
    );
  }

  cached = {
    isProduction,
    appUrl: parsed.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    storageMode,
    aiMode,
    billingMode,
    emailMode,
    supabase: {
      url: parsed.NEXT_PUBLIC_SUPABASE_URL,
      anonKey: parsed.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      serviceRoleKey: parsed.SUPABASE_SERVICE_ROLE_KEY,
      bucket: parsed.SUPABASE_STORAGE_BUCKET ?? "award-documents",
    },
    ai: {
      apiKey: parsed.AI_GATEWAY_API_KEY,
      model: parsed.AI_MODEL,
      criticModel: parsed.AI_CRITIC_MODEL ?? parsed.AI_MODEL,
    },
    stripe: {
      secretKey: parsed.STRIPE_SECRET_KEY,
      publishableKey: parsed.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      webhookSecret: parsed.STRIPE_WEBHOOK_SECRET,
      prices: {
        singleAward: parsed.STRIPE_SINGLE_AWARD_PRICE_ID,
        smallOrg: parsed.STRIPE_SMALL_ORG_PRICE_ID,
        team: parsed.STRIPE_TEAM_PRICE_ID,
      },
    },
    email: {
      apiKey: parsed.RESEND_API_KEY,
      from: parsed.EMAIL_FROM ?? "AwardLens <onboarding@resend.dev>",
    },
    cronSecret: parsed.CRON_SECRET,
    authSecret: parsed.AUTH_SECRET,
    warnings,
  };

  return cached;
}

/** Test-only: clears the memoised config so env changes take effect. */
export function resetServerConfigCache(): void {
  cached = null;
}

/**
 * Operator-facing description of how the app is configured. Deliberately
 * reports only booleans and mode names — never key material.
 */
export function describeConfig() {
  const config = getServerConfig();
  return {
    storageMode: config.storageMode,
    aiMode: config.aiMode,
    aiModel: config.aiMode === "live" ? config.ai.model : null,
    billingMode: config.billingMode,
    emailMode: config.emailMode,
    databaseConfigured: config.storageMode === "postgres",
    stripeConfigured: Boolean(config.stripe.secretKey),
    resendConfigured: Boolean(config.email.apiKey),
    cronProtected: Boolean(config.cronSecret),
    warnings: config.warnings,
  };
}
