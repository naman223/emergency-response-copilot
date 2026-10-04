import { test, expect } from "@playwright/test";
test.use({
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  },
  permissions: ["microphone"],
});
test("Chrome recordings reach manual review in fixture mode", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start demo session" }).click();
  await page.getByRole("button", { name: "Record audio", exact: true }).click();
  await page
    .getByText("Recording… stops automatically at 60 seconds.")
    .waitFor();
  await page.getByRole("button", { name: "Stop recording" }).click();
  await page.getByText("Recording ready to submit.").waitFor();
  await page.getByRole("button", { name: "Submit report" }).click();
  await expect(
    page.getByRole("heading", { name: "Incident brief" }),
  ).toBeVisible();
  await expect(
    page.getByText("Analysis unavailable", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/local mode analyzes the provided samples only/),
  ).toBeVisible();
});
