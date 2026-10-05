import { test, expect } from "@playwright/test";

test("preselects multiple services, previews each SMS, and preserves the approved recipient view", async ({
  page,
  context,
  browser,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start demo session" }).click();
  await page
    .getByRole("button", {
      name: "Start sample conversation: Followed near the north gate",
    })
    .click();
  await page
    .getByRole("button", {
      name: "University campus, beside the library",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Injuries reported", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Review handoff", exact: true })
    .click();
  const review = page.locator(".review-card");
  for (const service of ["Police", "Medical", "Emergency"])
    await expect(
      review.getByRole("checkbox", { name: service, exact: true }),
    ).toBeChecked();
  await expect(
    review.getByRole("checkbox", { name: "Fire", exact: true }),
  ).not.toBeChecked();
  await review.getByRole("checkbox", { name: "Fire", exact: true }).check();
  await expect(review.locator(".sms-card")).toHaveCount(4);
  await expect(review.locator(".sms-card").first()).toContainText(
    "University campus, beside the library (not verified)",
  );
  await expect(
    page.getByText("SMS sent (simulation)", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Send review", exact: true }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "Review and decide", exact: true })
    .click();
  await expect(
    review.getByRole("checkbox", { name: "Fire", exact: true }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Approve simulation" }).click();
  const outbox = page.getByRole("region", { name: "Simulated SMS outbox" });
  await expect(outbox.locator(".sms-card")).toHaveCount(4);
  await expect(outbox).toContainText("No real SMS");
  const recipientPromise = context.waitForEvent("page");
  await outbox
    .getByRole("link", { name: "Open Medical incident view" })
    .click();
  const recipient = await recipientPromise;
  await expect(
    recipient.getByRole("heading", { name: "Medical incident notification" }),
  ).toBeVisible();
  await expect(recipient.locator(".received-sms")).toContainText(
    "To: Medical | URGENT",
  );
  await expect(recipient.locator(".clarification-details")).toContainText(
    "Injuries reported",
  );
  await recipient.reload();
  await expect(
    recipient.getByRole("heading", { name: "Medical incident notification" }),
  ).toBeVisible();
  await recipient.setViewportSize({ width: 390, height: 844 });
  expect(
    await recipient.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const outsider = await browser.newContext();
  try {
    const external = await outsider.newPage();
    await external.goto(recipient.url());
    await external.getByRole("button", { name: "Start demo session" }).click();
    await expect(
      external.getByRole("heading", { name: "Notification unavailable" }),
    ).toBeVisible();
    await expect(
      external.getByText("Injuries reported", { exact: true }),
    ).toHaveCount(0);
  } finally {
    await outsider.close();
  }
  await page.reload();
  await expect(
    page
      .getByRole("region", { name: "Simulated SMS outbox" })
      .locator(".sms-card"),
  ).toHaveCount(4);
});

test("an empty recipient selection blocks dispatch until a service is chosen", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start demo session" }).click();
  await page
    .getByRole("button", {
      name: "Start sample conversation: Followed near the north gate",
    })
    .click();
  await page
    .getByRole("button", {
      name: "University campus, beside the library",
      exact: true,
    })
    .waitFor();
  await page
    .getByRole("button", { name: "Finish assessment now", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Review handoff", exact: true })
    .click();
  const selectors = page.locator(".service-selection input");
  for (const input of await selectors.all()) await input.uncheck();
  await page.getByRole("button", { name: "Send review", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Approve simulation" }),
  ).toBeDisabled();
  await expect(page.locator(".sms-card")).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Emergency", exact: true }).check();
  await page.getByRole("button", { name: "Send review", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Approve simulation" }),
  ).toBeEnabled();
});
