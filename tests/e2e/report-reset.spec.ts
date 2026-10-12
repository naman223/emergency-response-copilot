import { expect, test, type Page } from "@playwright/test";

async function start(page: Page) {
  // No model calls: preview results are controlled and no turns are submitted.
  for (const path of ["session", "samples"])
    await page.route(`**/api/${path}`, async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        json: { ...(await response.json()), mode: "live" },
      });
    });
  await page.goto("/");
  const sessionRequest = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/session") && request.method() === "POST",
  );
  await page.getByRole("button", { name: "Start demo session" }).click();
  await expect(
    page.getByRole("heading", { name: "Report an incident", exact: true }),
  ).toBeVisible();
  return (await (await sessionRequest).allHeaders()).authorization;
}

test("New incident clears the draft even when already on the report page", async ({
  page,
}) => {
  await start(page);
  await page
    .getByLabel("What is happening?")
    .fill("Discard this fictional draft.");
  await page.getByLabel("Location description").fill("Old gate");
  await page.getByRole("button", { name: "New incident", exact: true }).click();
  await expect(page.getByLabel("What is happening?")).toHaveValue("");
  await expect(page.getByLabel("Location description")).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Start conversation", exact: true }),
  ).toBeDisabled();
});

test("Reset report discards audio and a late transcription without clearing the session", async ({
  page,
}) => {
  await start(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/report-preview", async (route) => {
    await gate;
    await route
      .fulfill({
        json: {
          transcript: "Discarded recording.",
          locationDescription: "Old gate",
        },
      })
      .catch(() => {});
  });
  try {
    await page
      .getByLabel("Upload audio", { exact: true })
      .setInputFiles("fixtures/audio/ambiguous.wav");
    await expect(page.getByText("Transcribing recording…")).toBeVisible();
    await page.getByLabel("What is happening?").fill("Discard this text too.");
    await page
      .getByRole("button", { name: "Reset report", exact: true })
      .click();
    release();
    await expect(page.getByLabel("What is happening?")).toHaveValue("");
    await expect(page.getByLabel("Location description")).toHaveValue("");
    await expect(page.getByText("Attached: ambiguous.wav")).toHaveCount(0);
    await expect(page.getByText("Transcribing recording…")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Start demo session" }),
    ).toHaveCount(0);
    await page.getByLabel("What is happening?").fill("My new report.");
    await expect(page.getByLabel("What is happening?")).toHaveValue(
      "My new report.",
    );
    await expect(
      page.getByRole("button", { name: "Start conversation", exact: true }),
    ).toBeEnabled();
  } finally {
    release?.();
  }
});

test("resetting a draft preserves access to saved incidents", async ({
  page,
}) => {
  const authorization = await start(page);
  const response = await page.request.post(
    "http://127.0.0.1:8181/api/incidents",
    {
      headers: { authorization },
      data: { reportText: "Fictional saved report: a noise outside." },
    },
  );
  expect(response.status(), (await response.json()).error?.code).toBe(201);
  await page.reload();
  const saved = page
    .getByRole("navigation", { name: "Incident conversations" })
    .getByRole("button");
  await expect(saved).toHaveCount(1);
  await saved.click();
  await expect(
    page.getByRole("heading", { name: "AI emergency coordinator" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New incident", exact: true }).click();
  await page.getByLabel("What is happening?").fill("Discarded new draft.");
  await page.getByRole("button", { name: "Reset report", exact: true }).click();
  await expect(page.getByLabel("What is happening?")).toHaveValue("");
  await expect(saved).toHaveCount(1);
  await saved.click();
  await expect(
    page.getByRole("heading", { name: "AI emergency coordinator" }),
  ).toBeVisible();
});

test("mobile reset clears the transcript and GPS and allows the same audio to be uploaded again", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.context().grantPermissions(["geolocation"]);
  await page
    .context()
    .setGeolocation({ latitude: 12.9, longitude: 77.6, accuracy: 15 });
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
  await page.getByRole("button", { name: "Use device location" }).click();
  await expect(page.getByText(/Device location attached/)).toBeVisible();
  await page.getByRole("button", { name: "Reset report", exact: true }).click();
  await expect(page.getByLabel("What is happening?")).toHaveValue("");
  await expect(page.getByLabel("Location description")).toHaveValue("");
  await expect(
    page.getByText(
      /Device location attached|Attached: ambiguous.wav|Transcript ready/,
    ),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Start conversation", exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    path: "/private/tmp/copilot-report-reset-mobile.png",
  });
  await page
    .getByLabel("Upload audio", { exact: true })
    .setInputFiles("fixtures/audio/ambiguous.wav");
  await expect(page.getByLabel("What is happening?")).toHaveValue(
    "Noise at Gate 2.",
  );
});

for (const pending of [false, true])
  test(
    pending
      ? "Reset report releases a late microphone permission"
      : "Reset report stops recording without submitting the discarded audio",
    async ({ page }) => {
      await page.addInitScript(
        ({ pending }) => {
          const w = window as any;
          w.mediaStarts = 0;
          w.mediaStops = 0;
          const stream = { getTracks: () => [{ stop: () => w.mediaStops++ }] };
          Object.defineProperty(navigator, "mediaDevices", {
            value: {
              getUserMedia: () =>
                pending
                  ? new Promise((resolve) => {
                      w.grantPermission = () => resolve(stream);
                    })
                  : Promise.resolve(stream),
            },
          });
          w.MediaRecorder = class {
            static isTypeSupported() {
              return true;
            }
            state = "inactive";
            mimeType = "audio/webm";
            onstop?: () => void;
            start() {
              w.mediaStarts++;
              this.state = "recording";
            }
            stop() {
              this.state = "inactive";
              setTimeout(() => this.onstop?.(), 0);
            }
          };
        },
        { pending },
      );
      await start(page);
      let previews = 0;
      await page.route("**/api/report-preview", (route) => {
        previews++;
        return route.abort();
      });
      await page
        .getByRole("button", { name: "Record audio", exact: true })
        .click();
      await expect(
        page.getByRole("button", {
          name: pending ? "Waiting for microphone…" : "Stop recording",
          exact: true,
        }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Reset report", exact: true })
        .click();
      if (pending) await page.evaluate(() => (window as any).grantPermission());
      await expect
        .poll(() => page.evaluate(() => (window as any).mediaStops))
        .toBeGreaterThanOrEqual(1);
      expect(await page.evaluate(() => (window as any).mediaStarts)).toBe(
        pending ? 0 : 1,
      );
      await expect(
        page.getByRole("button", { name: "Record audio", exact: true }),
      ).toBeEnabled();
      await expect(page.getByLabel("What is happening?")).toHaveValue("");
      await expect(page.getByText("Recording ready to submit.")).toHaveCount(0);
      expect(previews).toBe(0);
    },
  );
