import { test, expect } from "@playwright/test";

test("sending a review with surrounding whitespace still enables approval", async ({
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
  await page.getByLabel("Reviewer summary").fill("  Human reviewed wording.  ");
  await page.getByRole("button", { name: "Send review", exact: true }).click();
  await expect(
    page.getByText("Review saved", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve simulation" }),
  ).toBeEnabled();
});

test("map location selection is saved separately from device GPS and drives nearby lookup", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).google = {
      maps: {
        Map: class {
          callback: any;
          constructor(host: HTMLElement) {
            const point = document.createElement("button");
            point.textContent = "Choose map test point";
            point.onclick = () =>
              this.callback?.({
                latLng: { lat: () => 28.631, lng: () => 77.219 },
              });
            host.append(point);
          }
          panTo() {}
          setZoom() {}
          addListener(_event: string, callback: any) {
            this.callback = callback;
            return { remove() {} };
          }
        },
        InfoWindow: class {
          setPosition() {}
          setContent() {}
          open() {}
          close() {}
        },
        Geocoder: class {
          async geocode() {
            if ((window as any).delayMapSearch)
              await new Promise((resolve) => {
                (window as any).finishMapSearch = resolve;
              });
            return {
              results: [
                {
                  formatted_address: "Example Gate, New Delhi",
                  geometry: {
                    location: { lat: () => 28.631, lng: () => 77.219 },
                  },
                },
              ],
            };
          }
        },
      },
    };
  });
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
  await page
    .getByRole("button", { name: "Select incident location on map" })
    .click();
  await page
    .getByLabel("Search incident address")
    .fill("Example Gate, New Delhi");
  await page
    .getByRole("button", { name: "Search address", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Example Gate, New Delhi", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm this incident location" })
    .click();
  await expect(page.getByLabel("Reviewed location description")).toHaveValue(
    "Example Gate, New Delhi",
  );
  await expect(
    page.getByLabel("I verified this location description"),
  ).toBeChecked();
  await expect(
    page.getByRole("link", { name: "Find nearby services in Google Maps" }),
  ).toHaveAttribute("href", /28.631%2C77.219/);
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/review") &&
      response.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "Send review", exact: true }).click();
  const incident = await (await saved).json();
  expect(incident.reviewDraft.selectedLocation).toMatchObject({
    latitude: 28.631,
    longitude: 77.219,
    source: "map",
  });
  expect(incident.sourceLocation).toBeUndefined();
  await page.reload();
  await page
    .getByRole("button", { name: "Review and decide", exact: true })
    .click();
  await expect(page.getByLabel("Reviewed location description")).toHaveValue(
    "Example Gate, New Delhi",
  );
  await expect(
    page.getByText(/Map-selected point: 28.631000, 77.219000/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Select incident location on map" })
    .click();
  await page.getByRole("button", { name: "Choose map test point" }).click();
  await page
    .getByRole("button", { name: "Confirm this incident location" })
    .click();
  await expect(page.getByLabel("Reviewed location description")).toHaveValue(
    "28.631000, 77.219000",
  );
  await page
    .getByLabel("Reviewed location description")
    .fill("A different entrance");
  await expect(page.getByText(/Map-selected point:/)).toHaveCount(0);
  await expect(
    page.getByLabel("I verified this location description"),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Select incident location on map" })
    .click();
  await page.evaluate(() => {
    (window as any).delayMapSearch = true;
  });
  await page
    .getByRole("button", { name: "Search address", exact: true })
    .click();
  await expect(page.getByText("Searching for the address…")).toBeVisible();
  await page.getByRole("button", { name: "Close location map" }).click();
  await page
    .getByRole("button", { name: "Select incident location on map" })
    .click();
  await expect(
    page.getByRole("button", { name: "Search address", exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => (window as any).finishMapSearch());
});

test("sends a populated review without typing and retains clarification details after approval", async ({
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
  await page.getByRole("button", { name: "Unknown", exact: true }).click();
  await page
    .getByRole("button", { name: "Review handoff", exact: true })
    .click();
  await expect(page.getByLabel("Reviewer summary")).not.toHaveValue("");
  await expect(page.getByLabel("Reviewed location description")).toHaveValue(
    "University campus, beside the library",
  );
  await expect(
    page.getByRole("heading", { name: "Clarifications and updates (2)" }),
  ).toBeVisible();
  await expect(page.locator(".clarification-details")).toContainText("Unknown");
  // Unclear reports have no inferred recipient; the reviewer chooses one.
  await page.getByRole("checkbox", { name: "Emergency", exact: true }).check();
  await page.getByRole("button", { name: "Send review", exact: true }).click();
  await expect(
    page.getByText("Review saved", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve simulation" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Approve simulation" }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Simulated dispatch complete" }),
  ).toBeVisible();
  await expect(page.locator(".clarification-details")).toContainText(
    "University campus, beside the library",
  );
  await expect(page.locator(".clarification-details")).toContainText("Unknown");
});

test("refreshes untouched review fields after clarification without losing unsaved human wording", async ({
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
  await page
    .getByRole("button", { name: "Review and decide", exact: true })
    .click();
  await page.getByLabel("Reviewer summary").fill("My unsaved human wording.");
  await page
    .getByRole("button", {
      name: "University campus, beside the library",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Reviewed location description")).toHaveValue(
    "University campus, beside the library",
  );
  await expect(page.getByLabel("Reviewer summary")).toHaveValue(
    "My unsaved human wording.",
  );
  await page.getByRole("button", { name: "Send review", exact: true }).click();
  await expect(
    page.getByText("Review saved", { exact: true }).first(),
  ).toBeVisible();
});
