import { test, expect } from "@playwright/test";

test("urgent clarification retains a visible incident report and updates service indicators", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start demo session" }).click();
  await page
    .getByRole("button", {
      name: "Start sample conversation: Followed near the north gate",
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "University campus, beside the library",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Response priority" }),
  ).toHaveAttribute("data-priority", "urgent");
  await expect(
    page.locator(".intake-progress .pending-question"),
  ).toContainText("Which site does the north gate refer to?");
  const report = page.locator(".conversation-thread .incident-report");
  await page
    .getByText("View detailed incident report", { exact: false })
    .click();
  await expect(
    report.getByRole("heading", { name: "Incident report", exact: true }),
  ).toBeVisible();
  await expect(report.locator('[data-indicator="police"]')).toContainText(
    "Yes",
  );
  await expect(report.locator('[data-indicator="ambulance"]')).toContainText(
    "Unknown",
  );
  await page
    .getByRole("button", {
      name: "University campus, beside the library",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "No injuries reported", exact: true })
    .click();
  await expect(
    page.getByText("Assessment ready", { exact: true }),
  ).toBeVisible();
  await expect(report.locator('[data-indicator="injuries"]')).toContainText(
    "No",
  );
  await expect(report.locator('[data-indicator="fire"]')).toContainText(
    "Unknown",
  );
  await page
    .getByRole("button", { name: "Review handoff", exact: true })
    .click();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page
    .getByRole("button", { name: "Approve & simulate dispatch" })
    .click();
  await page.reload();
  await expect(
    page.locator(".final-incident [data-indicator=injuries]"),
  ).toContainText("No");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
