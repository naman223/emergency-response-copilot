import { describe, it, expect } from "vitest";
import {
  analysisSchema,
  sourceLocationSchema,
  parseModelBrief,
  reviewDraftSchema,
  decisionSchema,
} from "../src/index";
const brief = {
  transcript: "Someone has a knife.",
  facts: [
    {
      text: "Weapon reported",
      quote: "has a knife",
      evidenceStatus: "matched",
    },
  ],
  unknowns: ["Exact location"],
  urgency: "urgent_review",
  routing: "police",
  explanation: "Caller reports a weapon.",
};
describe("untrusted incident contracts", () => {
  it.each([
    { probability: 0.97 },
    { latitude: 12 },
    { dispatch: true },
    { routing: "army" },
  ])("rejects unsupported model fields %j", (extra) =>
    expect(analysisSchema.safeParse({ ...brief, ...extra }).success).toBe(
      false,
    ),
  );
  it("downgrades unsupported evidence instead of asserting corroboration", () => {
    const b = parseModelBrief({
      ...brief,
      facts: [{ text: "Injury", quote: "bleeding", evidenceStatus: "matched" }],
    });
    expect(b.facts[0].evidenceStatus).toBe("unverified");
  });
  it("matches only a nonempty literal quote in the transcript", () =>
    expect(parseModelBrief(brief).facts[0].evidenceStatus).toBe("matched"));
  it("rejects invalid coordinates", () =>
    expect(
      sourceLocationSchema.safeParse({
        source: "device",
        latitude: 91,
        longitude: 0,
        capturedAt: "2026-10-04T10:00:00Z",
      }).success,
    ).toBe(false));
  it("requires meaningful review and closure reason", () => {
    expect(
      reviewDraftSchema.safeParse({
        summary: " ",
        urgency: "unclear",
        routing: "unclear",
        locationDescription: "",
        confirmedFields: [],
      }).success,
    ).toBe(false);
    expect(
      decisionSchema.safeParse({
        expectedRevision: 1,
        action: "close",
        reason: " ",
        idempotencyKey: "abc",
      }).success,
    ).toBe(false);
  });
});
