import { test, expect } from "@playwright/test";

test("one approval saves unsaved edits and selected services before simulating dispatch", async ({
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
  const summary =
    "Latest reviewer wording: the fictional employee needs police and medical support.";
  await page.getByLabel("Reviewer summary").fill(`  ${summary}  `);
  await page.getByRole("checkbox", { name: "Medical", exact: true }).check();
  let separateSaves = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/review") && request.method() === "PATCH")
      separateSaves++;
  });
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/decision") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Approve & simulate dispatch", exact: true })
    .click();
  const result = await (await response).json();
  expect(result.reviewDraft.summary).toBe(summary);
  expect(result.reviewDraft.services).toContain("medical");
  expect(result.reviewContextVersion).toBe(result.contextVersion);
  expect(
    result.dispatchReceipt.smsMessages.find((m: any) => m.service === "medical")
      .body,
  ).toContain(summary);
  expect(separateSaves).toBe(0);
  await page
    .getByRole("dialog", { name: "Service messages recorded" })
    .getByRole("button", { name: "View incident", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Simulated dispatch complete" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".final-summary")).toHaveText(summary);
  await expect(
    page.getByRole("region", { name: "Simulated SMS outbox" }),
  ).toContainText("Medical");
});
