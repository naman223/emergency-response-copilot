import { test, expect, type Page } from "@playwright/test";

async function prepare(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Start demo session" }).click();
  await page
    .getByRole("button", {
      name: "Start sample conversation: Followed near the north gate",
    })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Message the coordinator" }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Finish assessment now", exact: true })
    .click();
  // Finishing intake opens human review automatically, including its phone overlay.
  await expect(page.getByLabel("Reviewer summary")).toBeEditable();
}

test("a saved receipt opens confirmation for the actual recipients, with explicit SOS calling", async ({
  page,
}) => {
  await prepare(page);
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("checkbox", { name: "Police", exact: true }).check();
  await page.getByRole("checkbox", { name: "Medical", exact: true }).check();
  await page.getByRole("checkbox", { name: "Fire", exact: true }).check();
  await page
    .getByRole("checkbox", { name: "Emergency", exact: true })
    .uncheck();
  let decisions = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/decision")) decisions++;
  });
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/decision") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Approve & simulate dispatch", exact: true })
    .click();
  const result = await (await response).json();
  const dialog = page.getByRole("dialog", {
    name: "Service messages recorded",
  });
  await expect(dialog).toBeVisible();
  const recipients = dialog.getByRole("list", {
    name: "Notified services in this simulation",
  });
  await expect(recipients.getByRole("listitem")).toHaveCount(
    result.dispatchReceipt.smsMessages.length,
  );
  for (const service of ["Police", "Medical", "Fire"])
    await expect(recipients).toContainText(service);
  await expect(dialog).toContainText("No real emergency service was contacted");
  await expect(dialog).not.toContainText("on the way");
  await dialog
    .getByRole("button", { name: "SOS — immediate help", exact: true })
    .click();
  const sos = page.getByRole("dialog", { name: "Get immediate help" });
  await expect(sos).toBeVisible();
  await expect(
    sos.getByRole("link", { name: "Call 112 — India", exact: true }),
  ).toHaveAttribute("href", "tel:112");
  await expect(
    sos.getByRole("region", { name: "Incident brief for your call" }),
  ).toContainText(result.reviewDraft.summary);
  await expect(sos).toContainText("Outside India");
  expect(decisions).toBe(1);
  await page.keyboard.press("Escape");
  await expect(sos).not.toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "SOS — immediate help", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("button", { name: "View notification receipt", exact: true })
    .click();
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "View incident", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
});

test("failed approval never claims services received a message", async ({
  page,
}) => {
  await prepare(page);
  await page.route("**/decision", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          message: "Unable to save the simulated notifications. Try again.",
        },
      }),
    }),
  );
  await page
    .getByRole("button", { name: "Approve & simulate dispatch", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Unable to save");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "View notification receipt" }),
  ).not.toBeVisible();
});

test("confirmation and SOS fit a short phone screen and preserve keyboard focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 568 });
  await prepare(page);
  await page
    .getByRole("button", { name: "Approve & simulate dispatch", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Service messages recorded",
  });
  await expect(dialog).toBeVisible();
  const dismiss = dialog.getByRole("button", {
    name: "View incident",
    exact: true,
  });
  await expect(dismiss).toBeFocused();
  const box = await dialog.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(390);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(568);
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "SOS — immediate help", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  const sos = page.getByRole("dialog", { name: "Get immediate help" });
  await expect(sos).toBeVisible();
  await expect(
    sos.getByRole("link", { name: "Call 112 — India", exact: true }),
  ).toBeInViewport();
  await sos.getByRole("button", { name: "Close help", exact: true }).click();
  const sosButton = page.getByRole("button", {
    name: "SOS — immediate help",
    exact: true,
  });
  expect(
    await sosButton.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return element.contains(
        document.elementFromPoint(
          box.x + box.width / 2,
          box.y + box.height / 2,
        ),
      );
    }),
  ).toBe(true);
  await sosButton.click();
  await expect(sos).toBeVisible();
  await sos.getByRole("button", { name: "Close help", exact: true }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "View notification receipt", exact: true })
    .click();
  await expect(dialog).toBeVisible();
});
