import { chromium } from "@playwright/test";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const context = await browser.newContext({ baseURL: "http://localhost:3000", extraHTTPHeaders: { "x-forwarded-for": "203.0.113.202" } });
const page = await context.newPage();
page.on("console", (m) => console.log("[console]", m.type(), m.text()));
const email = `debug-signout2-${Date.now()}@example.org`;
await page.goto("/auth/sign-in");
await page.getByLabel("Email address").fill(email);
await page.getByRole("button", { name: /email me a code/i }).click();
const alert = page.getByRole("alert").filter({ hasText: "Development mode" });
await alert.waitFor();
const code = (await alert.innerText()).match(/\b(\d{6})\b/)[1];
await page.getByLabel("Six-digit code").fill(code);
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.waitForURL(/\/app$/);
await page.getByRole("button", { name: /account menu/i }).click();
await page.getByRole("menuitem", { name: "Sign out" }).waitFor();
// Submit the form directly, without going through Radix's click handling.
await page.evaluate(() => {
  const form = document.querySelector('[role="menuitem"]');
  form.requestSubmit();
});
await page.waitForTimeout(4000);
console.log("after requestSubmit, url =", page.url());
console.log("cookies:", (await context.cookies()).map((c) => c.name));
await browser.close();
