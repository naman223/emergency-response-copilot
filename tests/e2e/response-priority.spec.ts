import { test, expect } from "@playwright/test";

test("priority details start collapsed so the conversation gets most of the workspace", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 800 });
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
  const priority = page.getByRole("region", { name: "Response priority" });
  const workspace = await page.locator(".coordinator-workspace").boundingBox();
  const thread = await page.locator(".conversation-thread").boundingBox();
  const banner = await priority.boundingBox();
  console.log(
    JSON.stringify({
      workspaceHeight: workspace!.height,
      conversationHeight: thread!.height,
      priorityHeight: banner!.height,
    }),
  );
  expect(banner!.height).toBeLessThanOrEqual(100);
  expect(thread!.height).toBeGreaterThanOrEqual(workspace!.height * 0.45);
  const show = priority.getByRole("button", {
    name: "Show priority details",
    exact: true,
  });
  await expect(show).toHaveAttribute("aria-expanded", "false");
  await show.click();
  await expect(priority.locator('[data-need="ambulance"]')).toBeVisible();
  await expect(priority.locator(".priority-location")).toBeVisible();
  await priority
    .getByRole("button", { name: "Hide priority details", exact: true })
    .click();
  await expect(priority.locator('[data-need="ambulance"]')).not.toBeVisible();
  const restored = await page.locator(".conversation-thread").boundingBox();
  expect(restored!.height).toBeGreaterThanOrEqual(workspace!.height * 0.45);
});

test("medical urgency stays visible during clarification and yields to a recorded human handoff", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Start demo session" }).click();
  await page
    .getByRole("button", {
      name: "Start sample conversation: Unresponsive person near a loading bay",
    })
    .click();
  const priority = page.getByRole("region", { name: "Response priority" });
  await expect(priority).toHaveAttribute("data-priority", "urgent");
  await expect(priority.getByRole("heading")).toContainText("medical");
  await expect(priority.locator('[data-need="medical"]')).toContainText("Yes");
  await expect(priority.locator('[data-need="ambulance"]')).toContainText(
    "Yes",
  );
  await expect(priority.locator('[data-need="weapon"]')).toHaveCount(0);
  const composer = page.getByRole("textbox", {
    name: "Message the coordinator",
  });
  await expect(composer).toBeEnabled();
  await expect(
    page.locator(".message-row.coordinator").last(),
  ).toBeInViewport();
  const box = await composer.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await page
    .getByRole("button", { name: "Finish assessment now", exact: true })
    .click();
  await expect(page.locator('[data-phase="review"]')).toHaveAttribute(
    "aria-current",
    "step",
  );
  await expect(
    page.getByRole("region", { name: "Review priority" }),
  ).toContainText("Urgent medical review");
  await expect(
    page.getByRole("region", { name: "Review priority" }),
  ).toContainText("AI ambulance need: Yes");
  await page
    .getByRole("button", { name: "Approve & simulate dispatch", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Service messages recorded" })
    .getByRole("button", { name: "View incident", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Close incident panel", exact: true })
    .click();
  await expect(priority).toHaveAttribute("data-priority", "complete");
  await expect(priority).toContainText("Simulated handoff recorded");
  await expect(priority).toContainText("No real service contacted");
  await expect(page.locator('[data-phase="handoff"]')).toHaveAttribute(
    "aria-current",
    "step",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Close incident panel", exact: true })
    .click();
  await expect(priority).toHaveAttribute("data-priority", "complete");
});

test("closing without saving retains AI provenance and skips simulated handoff", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start demo session" }).click();
  await page
    .getByRole("button", {
      name: "Start sample conversation: Unresponsive person near a loading bay",
    })
    .click();
  await expect(
    page.getByRole("region", { name: "Response priority" }),
  ).toHaveAttribute("data-priority", "urgent");
  await page
    .getByRole("button", { name: "Review and decide", exact: true })
    .click();
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/decision") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Close report", exact: true }).click();
  const result = await (await response).json();
  expect(result.reviewDraft).toBeUndefined();
  expect(result.dispatchReceipt).toBeUndefined();
  const priority = page.getByRole("region", { name: "Response priority" });
  await expect(priority).toHaveAttribute("data-priority", "closed");
  await expect(priority).toContainText("AI priority");
  await expect(priority).toContainText("Suggested:");
  await expect(priority).not.toContainText("Reviewed priority");
  await expect(page.locator('[data-phase="handoff"]')).not.toHaveAttribute(
    "aria-current",
    "step",
  );
  await expect(page.locator('[data-phase="handoff"]')).toContainText(
    "Handoff skipped",
  );
});

test("standard reports keep neutral priority and unknown ambulance need", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start demo session" }).click();
  await page
    .getByRole("button", { name: /Start sample conversation:.*Kitchen/ })
    .click();
  const priority = page.getByRole("region", { name: "Response priority" });
  await expect(priority).toHaveAttribute("data-priority", "standard");
  await expect(priority).toContainText("Standard review");
  await expect(priority.locator('[data-need="ambulance"]')).toContainText(
    "Unknown",
  );
  await expect(priority).not.toContainText("Urgent medical");
});

test("short mobile viewports retain ambulance status and a usable reply composer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  await page.getByRole("button", { name: "Start demo session" }).click();
  await page
    .getByRole("button", {
      name: "Start sample conversation: Unresponsive person near a loading bay",
    })
    .click();
  const composer = page.getByRole("textbox", {
    name: "Message the coordinator",
  });
  await expect(composer).toBeEnabled();
  for (const size of [
    { width: 320, height: 640 },
    { width: 390, height: 568 },
  ]) {
    await page.setViewportSize(size);
    await expect(
      page.locator('.response-priority [data-priority-need="ambulance"]'),
    ).toBeInViewport();
    const box = await composer.boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(size.height);
    await expect(
      page.locator(".message-row.coordinator .message-bubble p").last(),
    ).toBeInViewport({ ratio: 0.2 });
  }
});

test("a completed update returns progress to human review after clarification was requested", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start demo session" }).click();
  await page
    .getByRole("button", {
      name: "Start sample conversation: Unresponsive person near a loading bay",
    })
    .click();
  await expect(
    page.getByRole("region", { name: "Response priority" }),
  ).toHaveAttribute("data-priority", "urgent");
  await page
    .getByRole("button", { name: "Finish assessment now", exact: true })
    .click();
  await page.getByRole("button", { name: "Clarify", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Message the coordinator" })
    .fill("Why this recommendation?");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Message the coordinator" }),
  ).toBeEnabled();
  await expect(page.locator('[data-phase="review"]')).toHaveAttribute(
    "aria-current",
    "step",
  );
});
