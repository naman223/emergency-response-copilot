import { it, expect } from "vitest";
import { incidentSchema, reviewDraftSchema } from "../src";

it("accepts device-based review coordinates while retaining their source and accuracy", () => {
  const draft = {
    summary: "Reviewed report",
    urgency: "unclear",
    routing: "unclear",
    locationDescription: "12.971600, 77.594600",
    confirmedFields: [],
    selectedLocation: {
      source: "device",
      latitude: 12.9716,
      longitude: 77.5946,
      accuracyMeters: 12,
      selectedAt: "2026-10-05T16:00:00Z",
    },
  };
  expect(reviewDraftSchema.safeParse(draft).success).toBe(true);
  expect(
    reviewDraftSchema.safeParse({
      ...draft,
      selectedLocation: { ...draft.selectedLocation, accuracyMeters: -1 },
    }).success,
  ).toBe(false);
});

it("retains a human-selected map point distinctly from device location", () => {
  const draft = {
    summary: "Caller report",
    urgency: "unclear",
    routing: "unclear",
    locationDescription: "Gate 3",
    confirmedFields: ["locationDescription"],
    editedFields: ["locationDescription"],
    selectedLocation: {
      latitude: 28.632,
      longitude: 77.219,
      source: "map",
      selectedAt: "2026-10-05T06:00:00Z",
    },
  };
  expect(reviewDraftSchema.safeParse(draft).success).toBe(true);
  expect(
    reviewDraftSchema.safeParse({
      ...draft,
      selectedLocation: { ...draft.selectedLocation, latitude: 95 },
    }).success,
  ).toBe(false);
});
