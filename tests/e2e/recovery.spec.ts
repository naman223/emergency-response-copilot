import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
test("late microphone permission is released after leaving caller intake", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as any;
    w.mediaStarts = 0;
    w.mediaStops = 0;
    w.permissionRequests = 0;
    const stream = { getTracks: () => [{ stop: () => w.mediaStops++ }] };
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: () => {
          w.permissionRequests++;
          return new Promise(
            (resolve) => (w.grantPermission = () => resolve(stream)),
          );
        },
      },
    });
    (window as any).MediaRecorder = class {
      static isTypeSupported() {
        return true;
      }
      stream = stream;
      state = "inactive";
      start() {
        w.mediaStarts++;
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
      }
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Start demo session" }).click();
  await page.getByRole("button", { name: "Record audio", exact: true }).click();
  await page
    .getByRole("button", { name: "Reset session", exact: true })
    .click();
  await page.getByRole("button", { name: "Start demo session" }).waitFor();
  await page.evaluate(() => (window as any).grantPermission());
  await expect
    .poll(() => page.evaluate(() => (window as any).mediaStops))
    .toBe(1);
  expect(await page.evaluate(() => (window as any).mediaStarts)).toBe(0);
});
test("only one microphone permission request can be pending", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as any;
    w.requests = 0;
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: () => {
          w.requests++;
          return new Promise(() => {});
        },
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Start demo session" }).click();
  await page
    .getByRole("button", { name: "Record audio", exact: true })
    .evaluate((b: HTMLButtonElement) => {
      b.click();
      b.click();
    });
  expect(await page.evaluate(() => (window as any).requests)).toBe(1);
});
test("reload recovers an interrupted final attempt into manual review", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start demo session" }).click();
  const created = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/incidents") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", {
      name: "Start sample conversation: Unclear noise outside",
    })
    .click();
  const i = await (await created).json();
  await page
    .getByRole("button", {
      name: "University campus, beside the library",
      exact: true,
    })
    .waitFor();
  await promisify(execFile)(process.execPath, [
    "--import",
    "tsx",
    "tests/helpers/interrupt-analysis.ts",
    i.id,
  ]);
  await page.reload();
  await expect(
    page.getByText("Response interrupted", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Review and decide", exact: true })
    .click();
  await page
    .getByLabel("Reviewer summary")
    .fill("Manual review after interrupted analysis");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("button", { name: "Save draft" })).toBeEnabled();
});

test("recorder initialization failure releases the granted microphone", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as any;
    w.mediaStops = 0;
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: async () => ({
          getTracks: () => [{ stop: () => w.mediaStops++ }],
        }),
      },
    });
    w.MediaRecorder = class {
      static isTypeSupported() {
        return true;
      }
      constructor() {
        throw new Error("Unsupported recorder");
      }
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Start demo session" }).click();
  await page.getByRole("button", { name: "Record audio", exact: true }).click();
  await expect(page.getByText(/Microphone unavailable/)).toBeVisible();
  expect(await page.evaluate(() => (window as any).mediaStops)).toBe(1);
});
