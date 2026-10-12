import { test, expect } from "@playwright/test";

test("device location selected at intake survives review, notification receipt and reload", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(success: PositionCallback) {
          success({
            coords: { latitude: 12.9716, longitude: 77.5946, accuracy: 12 },
            timestamp: Date.parse("2026-10-05T16:00:00Z"),
          } as GeolocationPosition);
        },
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Start demo session" }).click();
  await page
    .getByRole("button", { name: "Use device location", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Device location attached",
  );
  await page
    .getByRole("button", {
      name: "Start sample conversation: Followed near the north gate",
    })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Message the coordinator" }),
  ).toBeEnabled();
  await expect(page.getByLabel("Reviewed location description")).toHaveValue(
    "12.971600, 77.594600",
  );
  await expect(page.locator(".location-picker")).toContainText(
    "Device location (default): 12.971600, 77.594600",
  );
  await expect(page.locator(".location-picker")).toContainText(
    "GPS accuracy ±12 m",
  );
  await expect(
    page.getByLabel("I verified this location description"),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Finish assessment now", exact: true })
    .click();
  await expect(page.getByLabel("Reviewer summary")).toBeEditable();
  await page.getByLabel("I verified this location description").check();
  const nearby = await page
    .getByRole("link", { name: "Find nearby services in Google Maps" })
    .getAttribute("href");
  expect(decodeURIComponent(nearby!)).toContain("near 12.9716,77.5946");
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/decision") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Approve & simulate dispatch", exact: true })
    .click();
  const result = await (await response).json();
  expect(result.sourceLocation).toMatchObject({
    source: "device",
    latitude: 12.9716,
    longitude: 77.5946,
  });
  expect(result.reviewDraft.selectedLocation).toMatchObject({
    source: "device",
    latitude: 12.9716,
    longitude: 77.5946,
    accuracyMeters: 12,
  });
  for (const message of result.dispatchReceipt.smsMessages) {
    expect(message.body).toContain("Device GPS: 12.971600, 77.594600");
    expect(message.body).toContain("GPS accuracy: ±12 m");
  }
  const dialog = page.getByRole("dialog", {
    name: "Service messages recorded",
  });
  await dialog
    .getByRole("button", { name: "View incident", exact: true })
    .click();
  await page.reload();
  await expect(page.locator(".final-incident")).toContainText(
    "Device GPS point: 12.971600, 77.594600",
  );
  await expect(
    page.getByRole("region", { name: "Simulated SMS outbox" }),
  ).toContainText("Device GPS: 12.971600, 77.594600");
  await page
    .getByRole("button", { name: "SOS — immediate help", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Incident brief for your call" }),
  ).toContainText("Device GPS: 12.971600, 77.594600");
});

test("a different reported site does not silently verify device GPS, and human correction survives reload", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(success: PositionCallback) {
          success({
            coords: { latitude: 12.9716, longitude: 77.5946, accuracy: 12 },
            timestamp: Date.parse("2026-10-05T16:00:00Z"),
          } as GeolocationPosition);
        },
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Start demo session" }).click();
  await page
    .getByLabel(/Location description/)
    .fill("Chennai Facility, Tamil Nadu");
  await page
    .getByRole("button", { name: "Use device location", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Device location attached",
  );
  await page
    .getByRole("button", {
      name: "Start sample conversation: Followed near the north gate",
    })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Message the coordinator" }),
  ).toBeEnabled();
  await expect(page.getByLabel("Reviewed location description")).toHaveValue(
    "Chennai Facility, Tamil Nadu",
  );
  await expect(
    page.getByRole("checkbox", {
      name: "I verified this location description and the coordinates above",
      exact: true,
    }),
  ).not.toBeChecked();
  await expect(
    page.getByText(/Confirm that the incident is at this point/),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Find nearby services in Google Maps" }),
  ).not.toBeVisible();
  await page
    .getByLabel("Reviewed location description")
    .fill("Different incident site");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByText("Review saved", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "University campus, beside the library",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Message the coordinator" }),
  ).toBeEnabled();
  await expect(page.getByLabel("Reviewed location description")).toHaveValue(
    "Different incident site",
  );
  await expect(page.locator(".location-picker")).not.toContainText(
    "Device location (default)",
  );
  await page.reload();
  await expect(page.getByLabel("Reviewed location description")).toHaveValue(
    "Different incident site",
  );
  await expect(page.locator(".location-picker")).not.toContainText(
    "Device location (default)",
  );
});
