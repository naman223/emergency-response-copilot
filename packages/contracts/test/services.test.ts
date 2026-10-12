import { expect, it } from "vitest";
import {
  buildSmsPreviews,
  recommendedServices,
  serviceSelectionsSchema,
} from "../src/services";
import type { Incident, ReviewDraft } from "../src/incident";

it("selects independent response needs without treating unknown needs as yes", () => {
  const incident = {
    assessment: {
      routing: "police",
      indicators: {
        police: { status: "yes" },
        medical: { status: "unknown" },
        ambulance: { status: "yes" },
        fire: { status: "no" },
        emergency: { status: "yes" },
      },
    },
  } as Incident;
  expect(recommendedServices(incident)).toEqual([
    "police",
    "medical",
    "emergency",
  ]);
  expect(
    recommendedServices({ assessment: { routing: "fire" } } as Incident),
  ).toEqual(["fire"]);
  expect(serviceSelectionsSchema.safeParse(["police", "police"]).success).toBe(
    false,
  );
});

it("creates one explicitly simulated SMS per service using the reviewed location", () => {
  const draft: ReviewDraft = {
    summary: "A fictional injury report.",
    urgency: "urgent_review",
    routing: "police",
    services: ["police", "medical"],
    locationDescription: "East gate",
    confirmedFields: [],
  };
  const messages = buildSmsPreviews(
    "11111111-1111-4111-8111-111111111111",
    draft,
    "http://127.0.0.1:5173",
  );
  expect(messages.map((m) => m.service)).toEqual(["police", "medical"]);
  expect(messages[0].body).toContain("SIMULATION ONLY");
  expect(messages[0].body).toContain("East gate (not verified)");
  expect(messages[1].detailsUrl).toContain("service=medical");
  expect(messages[1].body).toContain(messages[1].detailsUrl);
  expect(
    buildSmsPreviews("id", { ...draft, services: [] }, "http://127.0.0.1:5173"),
  ).toEqual([]);
});

it("labels inherited device coordinates honestly in service messages", () => {
  const draft = {
    summary: "Reviewed report",
    urgency: "urgent_review",
    routing: "police",
    services: ["police"],
    locationDescription: "12.971600, 77.594600",
    confirmedFields: [],
    selectedLocation: {
      source: "device",
      latitude: 12.9716,
      longitude: 77.5946,
      accuracyMeters: 12,
      selectedAt: "2026-10-05T16:00:00Z",
    },
  } as unknown as ReviewDraft;
  const message = buildSmsPreviews("id", draft, "http://127.0.0.1:5173")[0]
    .body;
  expect(message).toContain("Device GPS: 12.971600, 77.594600");
  expect(message).toContain("GPS accuracy: ±12 m");
  expect(message).toContain("not verified");
  expect(message).not.toContain("Map pin");
});
