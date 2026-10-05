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

async function start(page: import("@playwright/test").Page) {
  await page.route("**/api/session", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ json: { ...(await response.json()), mode: "live" } });
  });
  await page.route("**/api/samples", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ json: { ...(await response.json()), mode: "live" } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Start demo session" }).click();
}

test("stopping a recording transcribes it without starting a conversation", async ({
  page,
}) => {
  await start(page);
  await page.route("**/api/report-preview", (route) =>
    route.fulfill({
      json: { transcript: "Noise near Gate 2.", locationDescription: "Gate 2" },
    }),
  );
  await page.getByRole("button", { name: "Record audio", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Start conversation", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expect(page.getByLabel("What is happening?")).toHaveValue(
    "Noise near Gate 2.",
  );
  await expect(page.getByLabel("Location description")).toHaveValue("Gate 2");
  await expect(
    page.getByRole("button", { name: "Start conversation", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("heading", { name: "Report an incident" }),
  ).toBeVisible();
});

test("discarding an upload ignores a late preview result", async ({ page }) => {
  await start(page);
  let deliver!: () => void;
  const waiting = new Promise<void>((resolve) => {
    deliver = resolve;
  });
  await page.route("**/api/report-preview", async (route) => {
    await waiting;
    await route
      .fulfill({
        json: { transcript: "Stale recording.", locationDescription: null },
      })
      .catch(() => {});
  });
  await page
    .getByLabel("Upload audio", { exact: true })
    .setInputFiles("fixtures/audio/ambiguous.wav");
  await expect(page.getByText("Transcribing recording…")).toBeVisible();
  await page.getByRole("button", { name: "Remove recording" }).click();
  await page.getByLabel("What is happening?").fill("Current report.");
  deliver();
  await expect(page.getByLabel("What is happening?")).toHaveValue(
    "Current report.",
  );
  await expect(page.getByText("Attached: ambiguous.wav")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Start conversation", exact: true }),
  ).toBeEnabled();
});
test("audio preview fills editable text and location before explicit submission", async ({
  page,
}) => {
  await start(page);
  await page.route("**/api/report-preview", (route) =>
    route.fulfill({
      json: {
        transcript: "I heard shouting near the north gate.",
        locationDescription: "the north gate",
      },
    }),
  );
  await page
    .getByLabel("Upload audio", { exact: true })
    .setInputFiles("fixtures/audio/ambiguous.wav");
  await expect(page.getByLabel("What is happening?")).toHaveValue(
    "I heard shouting near the north gate.",
  );
  await expect(page.getByLabel("Location description")).toHaveValue(
    "the north gate",
  );
  await expect(
    page.getByRole("heading", { name: "Report an incident" }),
  ).toBeVisible();
  await page
    .getByLabel("What is happening?")
    .fill("Corrected: shouting near the south gate.");
  await page.getByLabel("Location description").fill("south gate");
  await expect(page.getByText("Attached: ambiguous.wav")).toBeVisible();
  const request = page.waitForRequest(
    (r) => r.url().endsWith("/api/incidents") && r.method() === "POST",
  );
  await page
    .getByRole("button", { name: "Start conversation", exact: true })
    .click();
  const body = (await request).postDataBuffer()!.toString();
  expect(body).toContain(
    '"reportText":"Corrected: shouting near the south gate."',
  );
  expect(body).toContain('filename="ambiguous.wav"');
  await expect(
    page.getByRole("heading", { name: "AI emergency coordinator" }),
  ).toBeVisible();
});

test("late transcription preserves edits and can be applied explicitly", async ({
  page,
}) => {
  await start(page);
  let deliver!: () => void;
  const waiting = new Promise<void>((resolve) => {
    deliver = resolve;
  });
  await page.route("**/api/report-preview", async (route) => {
    await waiting;
    await route.fulfill({
      json: {
        transcript: "Noise at the north gate.",
        locationDescription: "the north gate",
      },
    });
  });
  await page
    .getByLabel("Upload audio", { exact: true })
    .setInputFiles("fixtures/audio/ambiguous.wav");
  await expect(page.getByText("Transcribing recording…")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start conversation", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("What is happening?").fill("My own report.");
  await page.getByLabel("Location description").fill("Verified west gate");
  deliver();
  await expect(
    page.getByRole("button", { name: "Use transcript in report" }),
  ).toBeVisible();
  await expect(page.getByLabel("What is happening?")).toHaveValue(
    "My own report.",
  );
  await expect(page.getByLabel("Location description")).toHaveValue(
    "Verified west gate",
  );
  await page.getByRole("button", { name: "Use transcript in report" }).click();
  await expect(page.getByLabel("What is happening?")).toHaveValue(
    "Noise at the north gate.",
  );
  await expect(page.getByLabel("Location description")).toHaveValue(
    "Verified west gate",
  );
});

test("transcription failure retains recording and permits retry or manual text", async ({
  page,
}) => {
  await start(page);
  await page.route("**/api/report-preview", (route) =>
    route.fulfill({
      status: 502,
      json: { error: { message: "Transcription could not finish." } },
    }),
  );
  await page
    .getByLabel("Upload audio", { exact: true })
    .setInputFiles("fixtures/audio/ambiguous.wav");
  await expect(page.getByText("Transcription could not finish.")).toBeVisible();
  await expect(page.getByText("Attached: ambiguous.wav")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry transcription" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Start conversation", exact: true }),
  ).toBeEnabled();
});

test("extracts a reported location from typed text without changing the report", async ({
  page,
}) => {
  await start(page);
  await page.route("**/api/report-preview", (route) =>
    route.fulfill({
      json: {
        transcript: "Smoke at Gate 3, Example Campus.",
        locationDescription: "Gate 3, Example Campus",
      },
    }),
  );
  await page
    .getByLabel("What is happening?")
    .fill("Smoke at Gate 3, Example Campus.");
  await page
    .getByRole("button", { name: "Suggest location from report" })
    .click();
  await expect(page.getByLabel("Location description")).toHaveValue(
    "Gate 3, Example Campus",
  );
  await expect(page.getByLabel("What is happening?")).toHaveValue(
    "Smoke at Gate 3, Example Campus.",
  );
});

test("a failed text location lookup does not offer an audio transcription retry", async ({
  page,
}) => {
  await start(page);
  await page.route("**/api/report-preview", (route) =>
    route.fulfill({
      json: { transcript: "Noise at Gate 2.", locationDescription: "Gate 2" },
    }),
  );
  await page
    .getByLabel("Upload audio", { exact: true })
    .setInputFiles("fixtures/audio/ambiguous.wav");
  await expect(page.getByLabel("What is happening?")).toHaveValue(
    "Noise at Gate 2.",
  );
  await page.getByLabel("What is happening?").fill("Correction: Gate 3.");
  await page.route("**/api/report-preview", (route) =>
    route.fulfill({
      status: 502,
      json: { error: { message: "Location lookup failed." } },
    }),
  );
  await page
    .getByRole("button", { name: "Suggest location from report" })
    .click();
  await expect(page.getByText("Location lookup failed.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry transcription" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Suggest location from report" }),
  ).toBeEnabled();
});
