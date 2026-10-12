import { expect, it } from "vitest";
import type { Incident } from "@copilot/contracts";
import { prefillReview } from "./review-draft";
const incident = {
  reportText: "Caller reports smoke.",
  locationDescription: "Main entrance",
} as Incident;
const sourceLocation = {
  source: "device" as const,
  latitude: 12.9716,
  longitude: 77.5946,
  accuracyMeters: 12,
  capturedAt: "2026-10-05T16:00:00Z",
};
it("carries explicitly attached device coordinates into review without verifying them", () => {
  const original = prefillReview({ ...incident, sourceLocation });
  expect(original.selectedLocation).toEqual({
    source: "device",
    latitude: sourceLocation.latitude,
    longitude: sourceLocation.longitude,
    accuracyMeters: 12,
    selectedAt: sourceLocation.capturedAt,
  });
  expect(original.confirmedFields).not.toContain("locationDescription");
  expect(
    prefillReview({ sourceLocation } as Incident).locationDescription,
  ).toBe("12.971600, 77.594600");
  expect(
    prefillReview({
      ...incident,
      sourceLocation: { ...sourceLocation, source: "sample" },
    }).selectedLocation,
  ).toBeUndefined();
});

it("never restores default GPS after a human replaces or clears the incident point", () => {
  const original = prefillReview({ ...incident, sourceLocation });
  const changed = {
    ...original,
    locationDescription: "Different site",
    selectedLocation: undefined,
    editedFields: ["locationDescription" as const],
  };
  expect(
    prefillReview({ ...incident, sourceLocation, reviewDraft: changed })
      .selectedLocation,
  ).toBeUndefined();
  const mapPoint = {
    source: "map" as const,
    latitude: 13,
    longitude: 78,
    selectedAt: sourceLocation.capturedAt,
  };
  expect(
    prefillReview({
      ...incident,
      sourceLocation,
      reviewDraft: { ...changed, selectedLocation: mapPoint },
    }).selectedLocation,
  ).toEqual(mapPoint);
});

it("requires verification again when adding GPS to an older untouched saved review", () => {
  const saved = prefillReview(incident);
  const next = prefillReview({
    ...incident,
    sourceLocation,
    reviewDraft: {
      ...saved,
      confirmedFields: ["locationDescription"],
      destinationName: "Previous destination",
    },
  });
  expect(next.selectedLocation?.source).toBe("device");
  expect(next.confirmedFields).not.toContain("locationDescription");
  expect(next.destinationName).toBeUndefined();
});
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
