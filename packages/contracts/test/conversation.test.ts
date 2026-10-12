import { it, expect } from "vitest";
import * as contracts from "../src/index";
const parse = (v: unknown, initial = false) =>
  (contracts as any).validateCoordinatorResponse(
    v,
    {
      transcript: "A knife was mentioned.",
      messages: { "11111111-1111-4111-8111-111111111111": "North gate" },
    },
    initial,
  );
const response = () => ({
  reply: "Received. Which entrance?",
  question: "Which entrance?",
  suggestedReplies: ["Unknown"],
  assessment: {
    summary: "Caller mentions a knife; context unclear.",
    facts: [
      {
        text: "Knife reported",
        source: { source: "transcript", quote: "A knife was mentioned." },
        evidenceStatus: "unverified",
      },
    ],
    unknowns: ["Exact location"],
    urgency: "unclear",
    routing: "unclear",
    locationDescription: "",
  },
});
it("rejects model authority fields and transcript replacement", () => {
  expect(() => parse({ ...response(), dispatch: true })).toThrow();
  expect(() => parse({ ...response(), transcript: "changed" })).toThrow();
});
it("offers original transcription only when audio is attached to a model request", () => {
  const modelSchema = (contracts as any).coordinatorModelResponseSchema;
  expect(modelSchema).toBeTypeOf("function");
  const withTranscript = {
    ...response(),
    transcript: "Original caller recording.",
  };
  expect(modelSchema(false).safeParse(response()).success).toBe(true);
  expect(modelSchema(false).safeParse(withTranscript).success).toBe(false);
  expect(modelSchema(true).safeParse(withTranscript).success).toBe(true);
});
it("checks quotes against the referenced source, not any available message", () => {
  const r = response();
  r.assessment.facts[0].source = {
    source: "officer",
    messageId: "11111111-1111-4111-8111-111111111111",
    quote: "A knife was mentioned.",
  } as any;
  expect(parse(r).assessment.facts[0].evidenceStatus).toBe("unverified");
  expect(parse(response()).assessment.facts[0].evidenceStatus).toBe("matched");
});
it("preserves unknown information without turning it into denial", () =>
  expect(parse(response()).assessment.unknowns).toEqual(["Exact location"]));
it("retains distinct emergency and service indicators with reasons, including unknown medical transport", () => {
  const indicators = Object.fromEntries(
    [
      "emergency",
      "police",
      "medical",
      "ambulance",
      "fire",
      "weapon",
      "injuries",
      "immediateDanger",
    ].map((key) => [
      key,
      {
        status: key === "weapon" ? "yes" : "unknown",
        reason:
          key === "weapon"
            ? "A knife was reported."
            : "Not established from the report.",
      },
    ]),
  );
  expect(
    parse({
      ...response(),
      assessment: { ...response().assessment, indicators },
    }).assessment.indicators,
  ).toEqual(indicators);
});
it("bounds messages and suggestions", () => {
  expect(() => parse({ ...response(), reply: "x".repeat(4001) })).toThrow();
  expect(() =>
    parse({ ...response(), suggestedReplies: Array(5).fill("Unknown") }),
  ).toThrow();
  expect(
    (contracts as any).turnRequestSchema.safeParse({
      turnId: "11111111-1111-4111-8111-111111111111",
      expectedRevision: 1,
      kind: "message",
      text: "x".repeat(2001),
    }).success,
  ).toBe(false);
});

const indicatorResponse = () => ({
  ...response(),
  assessment: {
    ...response().assessment,
    indicators: Object.fromEntries(
      [
        "emergency",
        "police",
        "medical",
        "ambulance",
        "fire",
        "weapon",
        "injuries",
        "immediateDanger",
      ].map((key) => [key, { status: "unknown", reason: "Not established." }]),
    ),
  },
});
it("keeps every Unknown indicator visible in the unknowns ledger", () => {
  const r = parse(indicatorResponse());
  expect(r.assessment.unknowns).toContain("Current immediate danger: Unknown");
  expect(r.assessment.unknowns).toContain("Injuries reported: Unknown");
  expect(r.assessment.unknowns).toContain("Ambulance need: Unknown");
  expect(r.assessment.unknowns).toContain("Exact location");
  expect(parse(r).assessment.unknowns).toEqual(r.assessment.unknowns);
});
it("rejects ambulance Yes while medical support is not Yes", () => {
  for (const status of ["no", "unknown"]) {
    const r = indicatorResponse();
    r.assessment.indicators.ambulance.status = "yes";
    r.assessment.indicators.medical.status = status;
    expect(() => parse(r)).toThrow(/ambulance/i);
  }
});
it("rejects Emergency Yes alongside standard or unclear priority", () => {
  const r = indicatorResponse();
  r.assessment.indicators.emergency.status = "yes";
  for (const urgency of ["standard_review", "unclear"]) {
    r.assessment.urgency = urgency;
    expect(() => parse(r)).toThrow(/Emergency Yes conflicts/);
  }
  r.assessment.urgency = "urgent_review";
  expect(() => parse(r)).not.toThrow();
});
it("reports independent indicator conflicts together for a bounded repair", () => {
  const r = indicatorResponse();
  r.assessment.urgency = "standard_review";
  r.assessment.indicators.emergency.status = "yes";
  r.assessment.indicators.ambulance.status = "yes";
  let message = "";
  try {
    parse(r);
  } catch (error) {
    message = (error as Error).message;
  }
  expect(message).toMatch(/Emergency Yes conflicts/);
  expect(message).toMatch(/Ambulance recommendation/);
});
it("rejects routing to a service whose indicator says No", () => {
  for (const [routing, indicator] of [
    ["police", "police"],
    ["medical", "medical"],
    ["fire", "fire"],
    ["other", "emergency"],
  ]) {
    const r = indicatorResponse();
    r.assessment.routing = routing;
    r.assessment.indicators[indicator].status = "no";
    expect(() => parse(r)).toThrow(/routing/i);
  }
});
it("rejects overflow rather than silently discarding unresolved details", () => {
  const r = indicatorResponse();
  r.assessment.unknowns = Array.from(
    { length: 20 },
    (_, i) => `Additional gap ${i}`,
  );
  expect(() => parse(r)).toThrow(/unresolved details/i);
});
it("clears stale generated Unknown entries after a clarification establishes the status", () => {
  const r = parse(indicatorResponse());
  r.assessment.indicators.injuries = {
    status: "yes",
    reason: "An injury is now reported.",
  };
  const updated = parse(r);
  expect(updated.assessment.unknowns).not.toContain(
    "Injuries reported: Unknown",
  );
  expect(updated.assessment.unknowns).toContain(
    "Current immediate danger: Unknown",
  );
});
it("retains an accepted Unknown answer in the gaps ledger even when the model omits it", () => {
  const r = indicatorResponse();
  r.assessment.facts = [
    {
      text: "Current personnel safety is unknown.",
      source: {
        source: "officer",
        messageId: "11111111-1111-4111-8111-111111111111",
        quote: "Unknown",
      },
      evidenceStatus: "unverified",
    },
  ] as any;
  const parsed = (contracts as any).validateCoordinatorResponse(
    r,
    { messages: { "11111111-1111-4111-8111-111111111111": "Unknown" } },
    false,
  );
  expect(parsed.assessment.unknowns).toContain(
    "Current personnel safety is unknown.",
  );
});
