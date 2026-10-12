import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import {
  coordinatorResponseSchema,
  type CoordinatorResponse,
} from "@copilot/contracts";
import {
  consistencyReviewContext,
  validateReviewedResponse,
} from "../src/conversation/consistency-review";
import type { ProviderInput } from "../src/conversation/provider";

const capture = JSON.parse(
  await readFile(
    "fixtures/regressions/medical-recommendation-wording.json",
    "utf8",
  ),
);
const id = "a2e02675-1a08-4cc0-bb2d-f1f47040e79c";
const safeReason =
  "Urgent ambulance response is suggested for medical assessment; transport needs require clinician assessment.";
function scenario() {
  const response = coordinatorResponseSchema.parse({
    reply: capture.reply,
    question: null,
    suggestedReplies: [],
    assessment: capture.assessment,
  });
  response.assessment!.indicators!.ambulance.reason = safeReason;
  const input: ProviderInput = {
    report: {
      text: capture.sourceTranscript,
      transcript: capture.sourceTranscript,
    },
    turns: [
      {
        id,
        incidentId: id,
        kind: "initial",
        officerText: capture.sourceTranscript,
        state: "processing",
        attempts: 1,
        createdAt: "2026-10-10T00:00:00Z",
        updatedAt: "2026-10-10T00:00:00Z",
      },
    ],
    signal: new AbortController().signal,
    intake: { questionsAsked: 0, forceFinish: false },
  };
  return { response, input };
}

it("rejects the actual captured definitive transport and life-support recommendation", () => {
  const { response, input } = scenario();
  response.assessment!.indicators!.ambulance.reason =
    capture.assessment.indicators.ambulance.reason;
  expect(() =>
    validateReviewedResponse({ assessment: {} }, response, input),
  ).toThrow(/medical recommendation/i);
});

it.each([
  "The employee requires urgent transport.",
  "Urgent transport is necessary for this employee.",
  "The employee must be transported to hospital.",
  "I recommend CPR for this employee.",
  "Please perform CPR while waiting.",
  "Life support is required, although injuries remain unknown.",
  "Injuries may be minor, but the employee requires life support.",
  "You should provide life support.",
  "Life support may be required.",
  "CPR should be started now.",
  "Consider CPR for the employee.",
  "The employee would benefit from life support.",
  "Please begin chest compressions.",
  "CPR is recommended for this employee.",
  "Life support is recommended for this employee.",
  "Can you do CPR while waiting?",
])("rejects unestablished treatment or definitive transport: %s", (text) => {
  const { response, input } = scenario();
  response.reply = text;
  expect(() =>
    validateReviewedResponse({ assessment: {} }, response, input),
  ).toThrow(/medical recommendation/i);
});

const surfaces: Array<[string, (response: CoordinatorResponse) => void]> = [
  [
    "reply",
    (r) => {
      r.reply = "The employee requires life support.";
    },
  ],
  [
    "assessment.summary",
    (r) => {
      r.assessment!.summary = "The employee requires life support.";
    },
  ],
  [
    "assessment.facts[0].text",
    (r) => {
      r.assessment!.facts[0].text = "The employee requires life support.";
    },
  ],
  [
    "assessment.indicators.medical.reason",
    (r) => {
      r.assessment!.indicators!.medical.reason =
        "The employee requires life support.";
    },
  ],
  [
    "assessment.unknowns",
    (r) => {
      r.assessment!.unknowns[0] = "The employee requires life support.";
    },
  ],
  [
    "question",
    (r) => {
      r.question = "Can you start CPR?";
    },
  ],
  [
    "suggestedReplies[0]",
    (r) => {
      r.suggestedReplies = ["I will perform CPR."];
    },
  ],
];
it.each(surfaces)(
  "reports the unsafe medical wording at %s",
  (path, change) => {
    const { response, input } = scenario();
    change(response);
    const feedback = JSON.parse(
      consistencyReviewContext(response, input),
    ).validationFeedback;
    expect(feedback).toContain(path);
    expect(feedback).toMatch(/medical recommendation/i);
  },
);

it.each([
  safeReason,
  "Urgent medical and ambulance response is recommended for the reported unresponsiveness. A clinician should assess treatment and transport needs.",
  "The employee may require ambulance transport following medical assessment.",
  "Ambulance response is recommended, but specific treatment requirements remain unknown.",
  "The employee could need medical transport following clinician assessment.",
  "Ambulance response is recommended, while CPR requirements remain unknown.",
  "The employee may urgently need transport following medical assessment.",
])(
  "keeps urgent service recommendations without clinical prescriptions: %s",
  (text) => {
    const { response, input } = scenario();
    response.reply = text;
    const accepted = validateReviewedResponse(
      { assessment: {} },
      response,
      input,
    );
    expect(accepted.assessment!.urgency).toBe("urgent_review");
    expect(accepted.assessment!.indicators!.medical.status).toBe("yes");
    expect(accepted.assessment!.indicators!.ambulance.status).toBe("yes");
    expect(accepted.assessment!.indicators!.injuries.status).toBe("unknown");
  },
);

it("preserves an attributed, verbatim clinician report rather than inventing a treatment decision", () => {
  const { response, input } = scenario();
  const source =
    "The paramedic reports that the employee requires urgent transport.";
  input.turns[0].officerText += " " + source;
  input.report.text = input.turns[0].officerText;
  response.assessment!.facts.push({
    text: source,
    source: { source: "officer", messageId: id, quote: source },
    evidenceStatus: "unverified",
  });
  response.reply = source;
  expect(
    validateReviewedResponse({ assessment: {} }, response, input).reply,
  ).toBe(source);
});

it("does not transfer a cited clinician report about a visitor to the employee", () => {
  const { response, input } = scenario();
  const source =
    "The paramedic reports that the visitor requires urgent transport.";
  input.turns[0].officerText += " " + source;
  response.assessment!.facts.push({
    text: source,
    source: { source: "officer", messageId: id, quote: source },
    evidenceStatus: "unverified",
  });
  response.reply =
    "The paramedic reports that the employee requires urgent transport.";
  expect(() =>
    validateReviewedResponse({ assessment: {} }, response, input),
  ).toThrow(/medical recommendation/i);
});

it.each([
  [
    "Correction: I cannot confirm whether the employee requires transport.",
    false,
  ],
  ["A visitor requires transport according to the paramedic.", true],
  [
    "Correction: The paramedic has withdrawn that report about the employee.",
    false,
  ],
  [
    "Correction: The clinician report about the employee is unconfirmed.",
    false,
  ],
  [
    "Correction: No medical support or ambulance is needed for the employee.",
    false,
  ],
])(
  "only relevant current updates withdraw an attributed report: %s",
  (update, accepted) => {
    const { response, input } = scenario();
    const source =
      "The paramedic reports that the employee requires urgent transport.";
    input.turns[0].officerText += " " + source;
    response.assessment!.facts.push({
      text: source,
      source: { source: "officer", messageId: id, quote: source },
      evidenceStatus: "unverified",
    });
    response.reply = source;
    input.turns.push({
      ...input.turns[0],
      id: "22222222-2222-4222-8222-222222222222",
      kind: "message",
      officerText: update,
    });
    const review = () =>
      validateReviewedResponse({ assessment: {} }, response, input);
    if (accepted) expect(review().reply).toBe(source);
    else expect(review).toThrow(/medical recommendation/i);
  },
);

it.each([
  [
    "Correction: I cannot confirm whether the employee requires transport.",
    false,
  ],
  [
    "Correction: No medical support or ambulance is needed for the employee.",
    false,
  ],
  ["A visitor requires transport according to the paramedic.", true],
])(
  "checks later corrections within the same cited officer source: %s",
  (update, accepted) => {
    const { response, input } = scenario();
    const source =
      "The paramedic reports that the employee requires urgent transport.";
    input.turns[0].officerText += " " + source + " " + update;
    response.assessment!.facts.push({
      text: source,
      source: { source: "officer", messageId: id, quote: source },
      evidenceStatus: "unverified",
    });
    response.reply = source;
    const review = () =>
      validateReviewedResponse({ assessment: {} }, response, input);
    if (accepted) expect(review().reply).toBe(source);
    else expect(review).toThrow(/medical recommendation/i);
  },
);

it.each(["officer", "transcript"] as const)(
  "keeps the latest clinician report after an earlier withdrawal in identical source copies: %s",
  (sourceKind) => {
    const { response, input } = scenario();
    const quote =
      "The paramedic reports that the employee requires urgent transport.";
    const source =
      capture.sourceTranscript +
      " Earlier, the paramedic had withdrawn that report about the employee. " +
      quote;
    input.report = { text: source, transcript: source };
    input.turns[0].officerText = source;
    response.assessment!.facts.push({
      text: quote,
      source:
        sourceKind === "officer"
          ? { source: "officer", messageId: id, quote }
          : { source: "transcript", quote },
      evidenceStatus: "unverified",
    });
    response.reply = quote;
    expect(
      validateReviewedResponse({ assessment: {} }, response, input).reply,
    ).toBe(quote);
  },
);
