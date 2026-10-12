import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { coordinatorResponseSchema } from "@copilot/contracts";
import {
  consistencyReviewContext,
  validateReviewedResponse,
} from "../src/conversation/consistency-review";
import type { ProviderInput } from "../src/conversation/provider";

const captured = JSON.parse(
  readFileSync("fixtures/regressions/medical-service-source.json", "utf8"),
).rows[0];

function scenario() {
  const turn = structuredClone(captured.reloadHistory.turns[0]);
  const response = coordinatorResponseSchema.parse({
    reply: turn.reply,
    question: turn.question,
    suggestedReplies: turn.suggestedReplies,
    assessment: turn.assessment,
  });
  response.assessment!.facts[1].source.quote =
    "A colleague there reported an unresponsive employee.";
  const input: ProviderInput = {
    report: {
      text: turn.officerText,
      transcript: captured.turns[0].sourceTranscript,
    },
    turns: [turn],
    signal: new AbortController().signal,
  };
  return { response, input };
}

it.each(["unknown", "no"] as const)(
  "rejects Emergency %s when urgent medical/ambulance assistance is recommended",
  (status) => {
    const { response, input } = scenario();
    response.assessment!.indicators!.emergency.status = status;
    expect(() =>
      validateReviewedResponse({ assessment: {} }, response, input),
    ).toThrow(/urgent.*emergency/i);
  },
);

it.each(["unknown", "no"] as const)(
  "retains Emergency Yes with current danger %s for urgent medical assistance",
  (status) => {
    const { response, input } = scenario();
    response.assessment!.indicators!.emergency = {
      status: "yes",
      reason: "Urgent medical and ambulance assessment is suggested.",
    };
    response.assessment!.indicators!.immediateDanger.status = status;
    if (status === "no") {
      const update = "No current immediate danger is observed.";
      const id = "22222222-2222-4222-8222-222222222222";
      input.turns.push({
        ...input.turns[0],
        id,
        kind: "message",
        officerText: update,
      });
      response.assessment!.facts.push({
        text: update,
        source: { source: "officer", messageId: id, quote: update },
        evidenceStatus: "unverified",
      });
    }
    const result = validateReviewedResponse(
      { assessment: {} },
      response,
      input,
    );
    expect(result.assessment!.indicators!.emergency.status).toBe("yes");
    expect(result.assessment!.indicators!.immediateDanger.status).toBe(status);
  },
);

it("does not infer Emergency merely from unknown danger in a standard medical review", () => {
  const { response, input } = scenario();
  response.assessment!.urgency = "standard_review";
  response.assessment!.indicators!.ambulance.status = "unknown";
  const result = validateReviewedResponse({ assessment: {} }, response, input);
  expect(result.assessment!.indicators!.emergency.status).toBe("unknown");
});

it.each([
  [
    "case alteration",
    {
      source: "transcript",
      quote: "a colleague there reported an unresponsive employee.",
    },
  ],
  [
    "ellipsis",
    {
      source: "transcript",
      quote: "A colleague there...unresponsive employee.",
    },
  ],
  [
    "wrong message",
    {
      source: "officer",
      messageId: "22222222-2222-4222-8222-222222222222",
      quote: "A colleague there reported an unresponsive employee.",
    },
  ],
  ["empty quote", { source: "transcript", quote: "" }],
] as const)(
  "rejects %s evidence and includes its path in review feedback",
  (_, source) => {
    const { response, input } = scenario();
    response.assessment!.indicators!.emergency = {
      status: "yes",
      reason: "Urgent medical and ambulance assessment is suggested.",
    };
    response.assessment!.facts[1].source = source;
    expect(() =>
      validateReviewedResponse({ assessment: {} }, response, input),
    ).toThrow(/facts\[1\].*quote/i);
    const context = JSON.parse(consistencyReviewContext(response, input));
    expect(context.validationFeedback).toMatch(/facts\[1\].*quote/i);
    expect(input.report.transcript).toBe(captured.turns[0].sourceTranscript);
  },
);

it("accepts the exact source quote without changing transcript or unknown observations", () => {
  const { response, input } = scenario();
  response.assessment!.indicators!.emergency = {
    status: "yes",
    reason: "Urgent medical and ambulance assessment is suggested.",
  };
  const result = validateReviewedResponse({ assessment: {} }, response, input);
  expect(result.assessment!.facts[1].source.quote).toBe(
    "A colleague there reported an unresponsive employee.",
  );
  expect(result.assessment!.facts[1].evidenceStatus).toBe("matched");
  expect(result.assessment!.indicators!.injuries.status).toBe("unknown");
});
