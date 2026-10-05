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
  await page.addInitScript(() => {
    const originalStart = MediaRecorder.prototype.start;
    MediaRecorder.prototype.start = function (...args) {
      (window as any).recordingStartedAt = performance.now();
      return originalStart.apply(this, args);
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Start demo session" }).click();
  await page.getByRole("button", { name: "Record audio", exact: true }).click();
  await page
    .getByText("Recording… stops automatically at 60 seconds.")
    .waitFor();
  // A real recording needs audio frames; an immediate stop can produce headers only.
  await page.waitForFunction(
    () => performance.now() - (window as any).recordingStartedAt >= 1000,
  );
  await page.getByRole("button", { name: "Stop recording" }).click();
  await page.getByText("Recording ready to submit.").waitFor();
  await page
    .getByRole("button", { name: "Start conversation", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "AI emergency coordinator" }),
  ).toBeVisible();
  await expect(
    page.getByText(/cannot interpret this report with AI yet/),
  ).toBeVisible();
});
