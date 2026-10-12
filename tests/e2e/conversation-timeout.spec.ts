import { expect, test } from "@playwright/test";

// Control only transport timing. Never forward this test's turn to Gemini.
for (const expires of [false, true]) {
  test(
    expires
      ? "the browser still bounds a stalled live response"
      : "a live response can complete after sixty seconds",
    async ({ page }) => {
      await page.clock.install();
      let snapshot: any;
      await page.route("**/api/incidents/*/conversation", async (route) => {
        if (!snapshot) {
          const response = await route.fetch();
          snapshot = await response.json();
          snapshot.incident.analysisMode = "live";
        }
        await route.fulfill({ json: snapshot });
      });
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let entered!: () => void;
      const requestStarted = new Promise<void>((resolve) => {
        entered = resolve;
      });
      await page.route("**/api/incidents/*/turns", async (route) => {
        const { turnId } = route.request().postDataJSON();
        entered();
        await gate;
        if (expires) return route.abort();
        const at = new Date().toISOString();
        snapshot = {
          ...snapshot,
          turns: [
            {
              id: turnId,
              incidentId: snapshot.incident.id,
              kind: "initial",
              officerText: "A fictional noise report.",
              state: "completed",
              attempts: 1,
              createdAt: at,
              updatedAt: at,
              reply: "Controlled response completed after the wait.",
              question: "Which site is the report from?",
              suggestedReplies: ["Unknown"],
            },
          ],
        };
        await route.fulfill({
          contentType: "application/x-ndjson",
          body:
            JSON.stringify({
              type: "completed",
              sequence: 1,
              turnId,
              snapshot,
            }) + "\n",
        });
      });
      try {
        await page.goto("/");
        await page.getByRole("button", { name: "Start demo session" }).click();
        await page
          .getByRole("button", {
            name: "Start sample conversation: Unclear noise outside",
          })
          .click();
        await requestStarted;
        await page.clock.runFor(expires ? 106000 : 61000);
        if (expires) {
          await expect(
            page.getByText(/did not reach this browser within its time limit/),
          ).toBeVisible();
        } else {
          release();
          await expect(
            page.getByText("Controlled response completed after the wait.", {
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            page.getByText(/within its time limit|was interrupted/),
          ).toHaveCount(0);
        }
      } finally {
        release?.();
      }
    },
  );
}
