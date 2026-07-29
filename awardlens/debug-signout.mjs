import { chromium } from "@playwright/test";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const context = await browser.newContext({
  baseURL: "http://localhost:3000",
  extraHTTPHeaders: { "x-forwarded-for": "203.0.113.201" },
});
const page = await context.newPage();
page.on("console", (m) => console.log("[console]", m.type(), m.text()));
page.on("requestfailed", (r) => console.log("[reqfail]", r.url(), r.failure()?.errorText));
page.on("response", (r) => {
  if (r.request().method() === "POST") console.log("[POST]", r.status(), r.url());
});

const email = `debug-signout-${Date.now()}@example.org`;
await page.goto("/auth/sign-in");
await page.getByLabel("Email address").fill(email);
await page.getByRole("button", { name: /email me a code/i }).click();
const alert = page.getByRole("alert").filter({ hasText: "Development mode" });
await alert.waitFor();
const code = (await alert.innerText()).match(/\b(\d{6})\b/)[1];
await page.getByLabel("Six-digit code").fill(code);
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.waitForURL(/\/app$/);
console.log("signed in, url =", page.url());

await page.getByRole("button", { name: /account menu/i }).click();
const item = page.getByRole("menuitem", { name: "Sign out" });
await item.waitFor();
console.log("menuitem tag:", await item.evaluate((n) => n.tagName));
console.log("menuitem html:", (await item.evaluate((n) => n.outerHTML)).slice(0, 400));

await item.click();
await page.waitForTimeout(4000);
console.log("after menuitem click, url =", page.url());
console.log("cookies:", (await context.cookies()).map((c) => c.name));

// Try clicking the inner submit button instead.
if (page.url().includes("/app")) {
  await page.goto("/app");
  await page.getByRole("button", { name: /account menu/i }).click();
  const inner = page.getByRole("menuitem", { name: "Sign out" }).locator("button[type=submit]");
  console.log("inner button count:", await inner.count());
  if (await inner.count()) {
    await inner.click({ force: true });
    await page.waitForTimeout(4000);
    console.log("after inner click, url =", page.url());
    console.log("cookies:", (await context.cookies()).map((c) => c.name));
  }
}

await browser.close();
