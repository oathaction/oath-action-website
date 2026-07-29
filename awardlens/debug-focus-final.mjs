import { chromium } from "@playwright/test";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ baseURL: "http://localhost:3000", extraHTTPHeaders: { "x-forwarded-for": "10.123.45.67" }, viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

const email = `focus-final-${Date.now()}@example.org`;
await page.goto("/auth/sign-in");
await page.getByLabel("Email address").fill(email);
await page.getByRole("button", { name: /email me a code/i }).click();
const alert = page.getByRole("alert").filter({ hasText: "Development mode" });
await alert.waitFor();
await page.getByLabel("Six-digit code").fill((await alert.innerText()).match(/\b(\d{6})\b/)[1]);
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.waitForURL(/\/app$/);
await page.goto("/app/awards/new");
await page.getByRole("tab", { name: "Use a sample" }).click();
await page.getByRole("button", { name: "Analyse the sample" }).click();
await page.waitForURL(/\/app\/awards\/[^/]+\/review/, { timeout: 120000 });
const id = new URL(page.url()).pathname.split("/")[3];
await page.goto(`/app/awards/${id}/review`);

const focusName = () => page.evaluate(() => {
  const a = document.activeElement;
  if (!a || a === document.body) return "<body>";
  return a.getAttribute("aria-label") || a.tagName.toLowerCase();
});

async function settle(ms = 1500) { await page.waitForTimeout(ms); return focusName(); }
const rail = () => page.getByRole("list", { name: "Obligations awaiting review" }).getByRole("article").first();

for (const how of ["Escape", "Cancel", "Save"]) {
  const title = (await rail().getByRole("heading").first().innerText()).trim();
  await rail().getByRole("button", { name: "Edit" }).click();
  await page.getByRole("dialog").waitFor();
  if (how === "Escape") await page.keyboard.press("Escape");
  else if (how === "Cancel") await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  else await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
  console.log(`editor closed via ${how.padEnd(6)} → ${await settle()}   (edited: "${title.slice(0, 40)}")`);
}

// delete: cancel first, then confirm
await rail().getByRole("button", { name: "Delete" }).click();
await page.getByRole("dialog").waitFor();
await page.keyboard.press("Escape");
console.log(`delete cancelled      → ${await settle()}`);

const doomed = (await rail().getByRole("heading").first().innerText()).trim();
await rail().getByRole("button", { name: "Delete" }).click();
await page.getByRole("dialog").waitFor();
await page.getByRole("dialog").getByRole("button", { name: "Delete permanently" }).click();
console.log(`delete confirmed      → ${await settle(2500)}   (deleted: "${doomed.slice(0, 40)}")`);

await browser.close();
