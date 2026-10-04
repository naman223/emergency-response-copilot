import { it, expect } from "vitest";
import { applyIntakePolicy } from "../src/conversation/intake-policy";
const response: any = {
  reply: "Another question?",
  question: "Another question?",
  suggestedReplies: ["Unknown"],
  assessment: {
    summary: "A reported incident.",
    facts: [],
    unknowns: ["Exact location"],
    urgency: "standard_review",
    routing: "police",
    locationDescription: "",
  },
};
it("stops at five unless a critical gap is explicitly identified, with a hard ceiling of ten", () => {
  expect(
    applyIntakePolicy(
      response,
      { questionsAsked: 5, forceFinish: false },
      undefined,
    ).ready,
  ).toBe(true);
  const extra = {
    ...response,
    clarificationReason: "Exact incident address is missing",
  };
  expect(
    applyIntakePolicy(
      extra,
      { questionsAsked: 5, forceFinish: false },
      undefined,
    ).ready,
  ).toBe(false);
  const end = applyIntakePolicy(
    extra,
    { questionsAsked: 10, forceFinish: false },
    undefined,
  );
  expect(end.ready).toBe(true);
  expect(end.response.question).toBeNull();
  expect(end.response.reply).not.toContain("Another question");
});
it("finishes urgent incidents immediately and cannot reopen a completed intake", () => {
  expect(
    applyIntakePolicy(
      {
        ...response,
        assessment: { ...response.assessment, urgency: "urgent_review" },
      },
      { questionsAsked: 0, forceFinish: false },
      undefined,
    ).ready,
  ).toBe(true);
  expect(
    applyIntakePolicy(
      response,
      { questionsAsked: 0, forceFinish: true },
      undefined,
    ).response.suggestedReplies,
  ).toEqual([]);
});
it("keeps unknowns and prior assessment when manually finishing", () => {
  const end = applyIntakePolicy(
    { ...response, assessment: null },
    { questionsAsked: 1, forceFinish: true },
    response.assessment,
  );
  expect(end.response.assessment?.unknowns).toEqual(["Exact location"]);
  expect(end.response.reply).toContain("Assessment ready");
});
