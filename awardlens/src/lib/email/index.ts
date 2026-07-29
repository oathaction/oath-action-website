import "server-only";

import { getServerConfig } from "@/lib/env";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type EmailResult =
  | { ok: true; id: string | null; mode: "resend" | "console" }
  | { ok: false; error: string };

/**
 * Sends transactional email, or logs it when Resend is not configured.
 *
 * Console mode is what makes local development and CI work without an API key.
 * It logs the subject and recipient only — never the body, which can contain
 * obligation text drawn from a private award document.
 */
export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const config = getServerConfig();

  if (config.emailMode === "console") {
    console.info(
      `[email:console] to=${redactEmail(message.to)} subject=${JSON.stringify(message.subject)} (body suppressed)`,
    );
    return { ok: true, id: null, mode: "console" };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(config.email.apiKey);
    const result = await resend.emails.send({
      from: config.email.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

    if (result.error) {
      return { ok: false, error: result.error.message };
    }
    return { ok: true, id: result.data?.id ?? null, mode: "resend" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unknown email error" };
  }
}

function redactEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local.slice(0, 2)}***@${domain}`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const SHELL_STYLES = `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#12181f;line-height:1.6;`;

export function renderEmailShell(title: string, bodyHtml: string, footer?: string): string {
  return `<!doctype html><html><body style="margin:0;background:#fbfaf7;padding:24px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #e3e0d8;border-radius:10px;" cellpadding="0" cellspacing="0">
      <tr><td style="padding:24px 28px 8px;${SHELL_STYLES}">
        <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#0f5c4a;font-weight:600;">AwardLens</div>
        <h1 style="font-size:20px;margin:12px 0 0;">${escapeHtml(title)}</h1>
      </td></tr>
      <tr><td style="padding:8px 28px 24px;${SHELL_STYLES}">${bodyHtml}</td></tr>
      <tr><td style="padding:16px 28px 24px;border-top:1px solid #e3e0d8;font-size:12px;color:#5b6472;${SHELL_STYLES}">
        ${escapeHtml(footer ?? "AwardLens helps you track what an award requires. It does not provide legal, accounting or compliance advice — always check the award document itself.")}
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

export function loginCodeEmail(code: string): { subject: string; html: string; text: string } {
  return {
    subject: `${code} is your AwardLens sign-in code`,
    html: renderEmailShell(
      "Your sign-in code",
      `<p>Enter this code to sign in. It expires in 15 minutes.</p>
       <p style="font-size:32px;letter-spacing:0.18em;font-weight:600;font-family:ui-monospace,Menlo,monospace;margin:20px 0;">${escapeHtml(code)}</p>
       <p style="font-size:13px;color:#5b6472;">If you did not request this, you can ignore this email.</p>`,
      "AwardLens will never ask you for this code by phone or email reply.",
    ),
    text: `Your AwardLens sign-in code is ${code}. It expires in 15 minutes.`,
  };
}
