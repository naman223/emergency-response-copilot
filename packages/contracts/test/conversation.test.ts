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
