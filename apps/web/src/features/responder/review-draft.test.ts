import { expect, it } from "vitest";
import type { Incident } from "@copilot/contracts";
import { prefillReview } from "./review-draft";
const incident = {
  reportText: "Caller reports smoke.",
  locationDescription: "Main entrance",
} as Incident;
it("prefills a report immediately and retains manual overrides as AI fields refresh", () => {
  const original = prefillReview(incident);
  expect(original.summary).toBe("Caller reports smoke.");
  expect(original.locationDescription).toBe("Main entrance");
  const next = prefillReview({
    ...incident,
    assessment: {
      summary: "Smoke confirmed by caller.",
      urgency: "urgent_review",
      routing: "fire",
      locationDescription: "South entrance",
      facts: [],
      unknowns: [],
    },
    reviewDraft: {
      ...original,
      summary: "Human wording",
      editedFields: ["summary"],
      confirmedFields: ["locationDescription"],
      destinationName: "Old station",
    },
  });
  expect(next.summary).toBe("Human wording");
  expect(next.routing).toBe("fire");
  expect(next.locationDescription).toBe("South entrance");
  expect(next.confirmedFields).toEqual([]);
  expect(next.destinationName).toBeUndefined();
});

it("refreshes suggested recipients but preserves an explicit human selection", () => {
  const original = prefillReview(incident);
  const updated = {
    ...incident,
    assessment: {
      summary: "Smoke",
      urgency: "urgent_review",
      routing: "fire",
      locationDescription: "Main entrance",
      facts: [],
      unknowns: [],
    },
  } as Incident;
  expect(prefillReview({ ...updated, reviewDraft: original }).services).toEqual(
    ["fire"],
  );
  const manual = {
    ...original,
    services: ["police", "medical"] as const,
    editedFields: ["services"] as const,
  };
  expect(
    prefillReview({
      ...updated,
      reviewDraft: {
        ...manual,
        services: [...manual.services],
        editedFields: [...manual.editedFields],
      },
    }).services,
  ).toEqual(["police", "medical"]);
  expect(
    prefillReview({
      ...updated,
      reviewDraft: {
        ...original,
        routing: "medical",
        editedFields: ["routing"],
      },
    }).services,
  ).toEqual(["medical"]);
});
