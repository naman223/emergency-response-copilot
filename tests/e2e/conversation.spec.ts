import { test, expect } from "@playwright/test";
test("urgent intake allows immediate human completion and records a selected simulated destination", async ({
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
  await expect(
    page.getByText("Assessment ready", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Finish assessment now" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Review handoff", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Find nearby services in Google Maps" }),
  ).toHaveCount(0);
  await page
    .getByLabel("Reviewed location description")
    .fill("Connaught Place, New Delhi, India");
  await page.getByLabel("I verified this location description").check();
  const link = page.getByRole("link", {
    name: "Find nearby services in Google Maps",
  });
  await expect(link).toHaveAttribute("href", /police%20stations.*Connaught/);
  await page
    .getByLabel("Selected service for simulated handoff")
    .fill("Reviewer-selected example police station");
  await page.getByLabel("I verified this location description").uncheck();
  await expect(
    page.getByLabel("Selected service for simulated handoff"),
  ).toHaveValue("");
  await page.getByLabel("I verified this location description").check();
  await page
    .getByLabel("Selected service for simulated handoff")
    .fill("Reviewer-selected example police station");
  await page.getByRole("button", { name: "Send review", exact: true }).click();
  await page.getByText("Review saved", { exact: true }).first().waitFor();
  await page
    .getByLabel("Decision reason")
    .fill("Training handoff only; incident location checked.");
  await page.getByRole("button", { name: "Approve simulation" }).click();
  await expect(
    page.getByRole("heading", { name: "Simulated dispatch complete" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Reviewer-selected example police station", { exact: true }),
  ).toBeVisible();
});
test("manual finish stops clarification and updates do not restart intake", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start demo session" }).click();
  await page
    .getByRole("button", {
      name: "Start sample conversation: Unclear noise outside",
    })
    .click();
  await page
    .getByRole("button", {
      name: "University campus, beside the library",
      exact: true,
    })
    .waitFor();
  await page.getByRole("button", { name: "Finish assessment now" }).click();
  await expect(
    page.getByText("Assessment ready", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Message the coordinator")
    .fill("Correction: University campus, south entrance");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page
      .locator(".message-row.coordinator .message-bubble:not(.provisional)")
      .last(),
  ).toContainText("south entrance");
  await expect(
    page.getByRole("button", { name: "Finish assessment now" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Unknown", exact: true }),
  ).toHaveCount(0);
});
test("officer discusses the report, clarifies, reviews and approves a simulation", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start demo session" }).click();
  await page
    .getByRole("button", {
      name: "Start sample conversation: Unclear noise outside",
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "AI emergency coordinator" }),
  ).toBeVisible();
  await expect(
    page.getByText("Scripted sample mode", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "University campus, beside the library",
      exact: true,
    })
    .click();
  await expect(
    page.getByText(/Can you confirm whether someone is asking for help/).last(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Unknown", exact: true }).click();
  await expect(page.getByText(/Assessment ready/).last()).toBeVisible();
  await page
    .getByRole("button", { name: "Review and decide", exact: true })
    .click();
  await page
    .getByLabel("Reviewer summary")
    .fill(
      "Reviewed caller report and officer-provided campus location. Injury status remains unknown.",
    );
  await page.getByRole("button", { name: "Send review" }).click();
  await expect(
    page.getByText("Review saved", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByLabel("Decision reason")
    .fill(
      "Original recording and available context reviewed for this simulation.",
    );
  await page.getByRole("button", { name: "Approve simulation" }).click();
  await expect(
    page.getByRole("heading", { name: "Simulated dispatch complete" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText(
      "Reviewed caller report and officer-provided campus location. Injury status remains unknown.",
      { exact: true },
    ),
  ).toBeVisible();
});
test("mobile conversation can preserve an unsupported message and show context", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Start demo session" }).click();
  await page
    .getByRole("button", {
      name: "Start sample conversation: Unclear noise outside",
    })
    .click();
  await page
    .getByRole("button", {
      name: "University campus, beside the library",
      exact: true,
    })
    .waitFor();
  await page
    .getByLabel("Message the coordinator")
    .fill("Can you interpret a completely unrelated request?");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByText(/cannot reliably interpret that free-form message/).last(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Incident context", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Incident context", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("mobile reply composer remains inside the viewport without page scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Start demo session" }).click();
  await page
    .getByRole("button", {
      name: "Start sample conversation: Unclear noise outside",
    })
    .click();
  await page
    .getByRole("button", {
      name: "University campus, beside the library",
      exact: true,
    })
    .waitFor();
  const box = await page.getByLabel("Message the coordinator").boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  expect(box!.y).toBeGreaterThanOrEqual(0);
});
test("new clarification preserves the saved review and requires rechecking", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start demo session" }).click();
  await page
    .getByRole("button", {
      name: "Start sample conversation: Unclear noise outside",
    })
    .click();
  await page
    .getByRole("button", {
      name: "University campus, beside the library",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Unknown", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Review and decide", exact: true })
    .click();
  await page
    .getByLabel("Reviewer summary")
    .fill("My deliberately saved human summary.");
  await page.getByRole("button", { name: "Send review", exact: true }).click();
  await expect(
    page.getByText("Review saved", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Unknown", exact: true }).click();
  await expect(
    page.getByText(/New information arrived. Recheck your saved review/),
  ).toBeVisible();
  await expect(page.getByLabel("Reviewer summary")).toHaveValue(
    "My deliberately saved human summary.",
  );
  await page.getByLabel("Decision reason").fill("Reviewing new information");
  await expect(
    page.getByRole("button", { name: "Approve simulation" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Send review", exact: true }).click();
  await page.getByLabel("Decision reason").fill("New context checked");
  await expect(
    page.getByRole("button", { name: "Approve simulation" }),
  ).toBeEnabled();
});
