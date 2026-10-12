import { test, expect } from "@playwright/test";
test("separate browser sessions start with their own empty queue", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: "Start demo session" }).click();
  await expect(page.getByText(/Your incident conversations/)).toBeVisible();
  await context.close();
});
test("permission refusal leaves the sample workflow usable on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition: (_ok: any, fail: any) => fail({ code: 1 }) },
    });
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: () => Promise.reject(new Error("Permission denied")),
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Start demo session" }).click();
  await page.getByRole("button", { name: "Use device location" }).click();
  await expect(page.getByText(/Location unavailable/)).toBeVisible();
  await page.getByRole("button", { name: "Record audio", exact: true }).click();
  await expect(page.getByText(/Microphone unavailable/)).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Start sample conversation: Followed near the north gate",
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("mobile users can reset their session", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Start demo session" }).click();
  await expect(
    page.getByRole("button", { name: "Reset session", exact: true }),
  ).toBeVisible({ timeout: 1500 });
  await page
    .getByRole("button", { name: "Reset session", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Start demo session" }),
  ).toBeVisible();
});
