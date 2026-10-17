import { beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "@google/genai";
import { readFile } from "node:fs/promises";
import { GeminiConversationProvider } from "../src/conversation/gemini";
import { createConfig } from "../src/config";
import { buildConversationContext } from "../src/conversation/context";
import type {
  ProviderInput,
  ProviderChunk,
} from "../src/conversation/provider";
import {
  validateReviewedResponse,
  consistencyReviewContext,
} from "../src/conversation/consistency-review";

const transport = vi.hoisted(() => ({
  responses: [] as unknown[],
  requests: [] as any[],
}));
// Replace only Vertex's network transport; JSON decoding and validation remain real.
vi.mock("@google/genai", async (original) => ({
  ...(await original<typeof import("@google/genai")>()),
  GoogleGenAI: class {
    models = {
      generateContentStream: async (request: any) => {
        transport.requests.push(request);
        if (!transport.responses.length) throw Error("Review unavailable");
        const value = transport.responses.shift();
        if (value instanceof Error) throw value;
        const text = JSON.stringify(value);
        return (async function* () {
          yield { candidates: [{ content: { parts: [{ text }] } }] };
        })();
      },
    };
  },
}));
const id = "11111111-1111-4111-8111-111111111111";
async function capturedServiceScenario() {
  const capture = JSON.parse(
    await readFile("fixtures/regressions/medical-service-source.json", "utf8"),
  ).rows[0];
  const turn = capture.reloadHistory.turns[0];
  return {
    original: {
      reply: turn.reply,
      question: turn.question,
      suggestedReplies: turn.suggestedReplies,
      assessment: turn.assessment,
      transcript: capture.turns[0].sourceTranscript,
    },
    context: {
      report: {
        text: turn.officerText,
        transcript: capture.turns[0].sourceTranscript,
        wav: new Uint8Array([1, 2]),
      },
      turns: [turn],
      signal: new AbortController().signal,
    } as ProviderInput,
  };
}

it("publishes nothing when both reviews preserve the captured urgent-service and quote defects", async () => {
  const { original, context } = await capturedServiceScenario();
  transport.responses.push(original, { assessment: {} }, { assessment: {} });
  const published: ProviderChunk[] = [];
  await expect(
    (async () => {
      for await (const chunk of provider().generate(context))
        published.push(chunk);
    })(),
  ).rejects.toThrow(/urgent.*emergency.*facts\[1\].*quote/is);
  expect(published).toEqual([]);
  expect(transport.requests).toHaveLength(3);
});

it("repairs the captured quote while preserving the first review's Emergency correction and original transcript", async () => {
  const { original, context } = await capturedServiceScenario();
  const facts = structuredClone(original.assessment.facts);
  facts[1].source.quote =
    "A colleague there reported an unresponsive employee.";
  transport.responses.push(
    original,
    {
      assessment: {
        indicators: {
          emergency: {
            status: "yes",
            reason: "Urgent medical and ambulance assessment is suggested.",
          },
        },
      },
    },
    { assessment: { facts } },
  );
  const chunks: ProviderChunk[] = [];
  for await (const chunk of provider().generate(context)) chunks.push(chunk);
  const result = chunks.find((chunk) => chunk.type === "result") as any;
  expect(result.response.assessment.indicators.emergency.status).toBe("yes");
  expect(result.response.assessment.indicators.immediateDanger.status).toBe(
    "unknown",
  );
  expect(result.response.assessment.facts[1].evidenceStatus).toBe("matched");
  expect(result.response.transcript).toBe(original.transcript);
  expect(transport.requests).toHaveLength(3);
});
const report =
  "No person is currently inside the building, no injuries have been reported, and the area is now secured.";
const draft = () => ({
  reply:
    "The building is empty and secured, so there is no immediate danger. Is personnel safety known?",
  question: "Is personnel safety known?",
  suggestedReplies: ["Unknown"],
  assessment: {
    summary:
      "The building is reported empty and secured. Personnel safety is unknown.",
    facts: [
      {
        text: "Area reported secured",
        source: { source: "officer", messageId: id, quote: report },
        evidenceStatus: "unverified",
      },
    ],
    unknowns: ["Personnel safety"],
    urgency: "standard_review",
    routing: "police",
    locationDescription: "Hyderabad Warehouse",
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
      ].map((key) => [
        key,
        {
          status:
            key === "police"
              ? "yes"
              : key === "immediateDanger"
                ? "no"
                : "unknown",
          reason: "Report-based assessment.",
        },
      ]),
    ),
  },
});
const input = (): ProviderInput => ({
  report: { text: report },
  turns: [
    {
      id,
      incidentId: id,
      kind: "initial",
      officerText: report,
      state: "processing",
      attempts: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  signal: new AbortController().signal,
  intake: { questionsAsked: 0, forceFinish: false },
});
const provider = () =>
  new GeminiConversationProvider(
    createConfig({
      ANALYSIS_MODE: "live",
      GOOGLE_CLOUD_PROJECT: "test",
      GEMINI_MODEL: "gemini-test",
    }),
  );
async function collect(value = input()) {
  const chunks = [];
  for await (const chunk of provider().generate(value)) chunks.push(chunk);
  return chunks;
}
beforeEach(() => {
  transport.responses = [];
  transport.requests = [];
});

const voiceGroundingCases: Array<{
  id: string;
  pass?: number;
  sourceTranscript: string;
  reply: string;
  assessment: any;
}> = JSON.parse(
  await readFile(
    "fixtures/regressions/voice-grounding-overstatements.json",
    "utf8",
  ),
).cases;
const medicalCapture = JSON.parse(
  await readFile(
    "fixtures/regressions/medical-recommendation-wording.json",
    "utf8",
  ),
);
function medicalProviderScenario() {
  const context = input();
  context.report = {
    text: medicalCapture.sourceTranscript,
    transcript: medicalCapture.sourceTranscript,
    wav: new Uint8Array([1, 2]),
  };
  context.turns[0].id = medicalCapture.assessment.facts[0].source.messageId;
  context.turns[0].officerText = medicalCapture.sourceTranscript;
  const value = {
    reply: medicalCapture.reply,
    question: null,
    suggestedReplies: [],
    transcript: medicalCapture.sourceTranscript,
    assessment: structuredClone(medicalCapture.assessment),
  };
  return { context, value };
}
it("publishes no clinical prescription when both bounded medical reviews leave it unchanged", async () => {
  const { context, value } = medicalProviderScenario();
  transport.responses.push(value, { assessment: {} }, { assessment: {} });
  const published: ProviderChunk[] = [];
  await expect(
    (async () => {
      for await (const chunk of provider().generate(context))
        published.push(chunk);
    })(),
  ).rejects.toThrow(/medical recommendation/i);
  expect(published).toEqual([]);
  expect(transport.requests).toHaveLength(3);
});
it("repairs medical wording while preserving the first review, original transcript and urgent service needs", async () => {
  const { context, value } = medicalProviderScenario();
  const summary =
    "The employee is reported unresponsive at the Chennai facility. Urgent medical review is suggested; injury and weapon status remain unknown.";
  const reason =
    "Urgent ambulance response is suggested for medical assessment; treatment and transport needs require clinician assessment.";
  transport.responses.push(
    value,
    { assessment: { summary } },
    { assessment: { indicators: { ambulance: { status: "yes", reason } } } },
  );
  const chunks = await collect(context);
  const result = (chunks.find((c) => c.type === "result") as any).response;
  expect(result.assessment.summary).toBe(summary);
  expect(result.transcript).toBe(medicalCapture.sourceTranscript);
  expect(result.assessment.urgency).toBe("urgent_review");
  expect(result.assessment.indicators.medical.status).toBe("yes");
  expect(result.assessment.indicators.ambulance).toEqual({
    status: "yes",
    reason,
  });
  expect(result.assessment.indicators.injuries.status).toBe("unknown");
  expect(transport.requests).toHaveLength(3);
});
it.each(voiceGroundingCases)(
  "rejects captured $id pass $pass grounding overstatements before publication",
  (item: any) => {
    const context = input();
    const officerId =
      item.assessment.facts.find(
        (fact: any) => fact.source.source === "officer",
      )?.source.messageId ?? id;
    context.report = {
      text: item.sourceTranscript,
      transcript: item.sourceTranscript,
    };
    context.turns[0].id = officerId;
    context.turns[0].officerText = item.sourceTranscript;
    const value = {
      reply: item.reply,
      question: null,
      suggestedReplies: [],
      assessment: item.assessment,
    };
    expect(
      () => validateReviewedResponse({ assessment: {} }, value, context),
      `${item.id} pass ${item.pass ?? 1}`,
    ).toThrow(/cause|causal|reported injury|breathing|attack/i);
  },
);

it("rejects unsupported causes independently in indicator reasons and matched fact text", () => {
  const context = input();
  context.report.text =
    "The suspect threatened the employee with a knife. The employee has a minor injury.";
  context.turns[0].officerText = context.report.text;
  const value = draft();
  value.reply = "A knife threat and a minor injury are reported.";
  value.assessment.summary = value.reply;
  value.assessment.indicators.immediateDanger.status = "unknown";
  value.assessment.facts[0].source.quote = "The employee has a minor injury.";
  value.assessment.facts[0].text = "The suspect caused a minor injury.";
  value.assessment.indicators.emergency.reason =
    "The robbery resulted in a minor injury.";
  const feedback = JSON.parse(
    consistencyReviewContext(value, context),
  ).validationFeedback;
  expect(feedback).toMatch(/facts\[0\].text/);
  expect(feedback).toMatch(/indicators.emergency.reason/);
});

it("requires an affirmative matched cause, not uncertainty or an unrelated source cause", () => {
  for (const source of [
    "The suspect threatened an employee. It is unknown whether the suspect caused the employee's injury.",
    "The suspect threatened an employee. Did the suspect cause the employee's injury?",
    "The suspect threatened an employee. The suspect did not cause the employee's injury.",
    "The suspect threatened an employee. A fall caused a visitor's injury.",
    "Cannot confirm the suspect caused the employee's injury.",
    "There is no evidence that the suspect caused the employee's injury.",
  ]) {
    const context = input();
    context.report.text = source;
    context.turns[0].officerText = source;
    const value = draft();
    value.reply = "The suspect caused the employee's injury.";
    value.assessment.summary = value.reply;
    value.assessment.indicators.immediateDanger.status = "unknown";
    value.assessment.facts[0].source.quote = source;
    expect(() =>
      validateReviewedResponse({ assessment: {} }, value, context),
    ).toThrow(/cause|causal/i);
  }
});

it("does not use unrelated clause uncertainty to hide a definite cause or breathing claim", () => {
  for (const [source, claim, issue] of [
    [
      "The suspect threatened the employee. The employee has an injury.",
      "The suspect caused the employee's injury, but current danger is uncertain.",
      /cause|causal/i,
    ],
    [
      "No breathing has been observed.",
      "The employee is not breathing, but immediate danger is uncertain.",
      /breathing/i,
    ],
    [
      "No breathing has been observed.",
      "If an ambulance is available, the employee is not breathing.",
      /breathing/i,
    ],
  ] as const) {
    const context = input();
    context.report.text = source;
    context.turns[0].officerText = source;
    const value = draft();
    value.reply = claim;
    value.assessment.summary = value.reply;
    value.assessment.indicators.immediateDanger.status = "unknown";
    value.assessment.facts[0].source.quote = source;
    expect(() =>
      validateReviewedResponse({ assessment: {} }, value, context),
    ).toThrow(issue);
  }
});

it("retains a causal confirmation after an unrelated person's cause update", () => {
  const context = input();
  context.report.text = "The suspect caused the employee's injury.";
  context.turns[0].officerText = context.report.text;
  context.turns.push({
    ...context.turns[0],
    id: "22222222-2222-4222-8222-222222222222",
    officerText: "The visitor's injury was caused by a fall.",
  });
  const value = draft();
  value.reply = "The suspect caused the employee's injury.";
  value.assessment.summary = value.reply;
  value.assessment.indicators.immediateDanger.status = "unknown";
  value.assessment.facts[0].source.quote = context.report.text;
  expect(
    validateReviewedResponse({ assessment: {} }, value, context).reply,
  ).toBe(value.reply);
});

it("does not borrow an affirmative cause from the wrong victim mentioned by the same source", () => {
  const context = input();
  context.report.text =
    "The employee reports that the suspect caused a visitor's injury.";
  context.turns[0].officerText = context.report.text;
  const value = draft();
  value.reply = "The suspect caused the employee's injury.";
  value.assessment.summary = value.reply;
  value.assessment.indicators.immediateDanger.status = "unknown";
  value.assessment.facts[0].source.quote = context.report.text;
  expect(() =>
    validateReviewedResponse({ assessment: {} }, value, context),
  ).toThrow(/cause|causal/i);
});

it("rejects withdrawn causal and breathing confirmations, including short Unknown answers", () => {
  for (const [source, question, claim, issue] of [
    [
      "The suspect caused the employee's injury.",
      "Did the suspect cause that injury?",
      "The suspect caused the employee's injury.",
      /cause|causal/i,
    ],
    [
      "No breathing has been observed. The doctor confirmed the employee is not breathing.",
      "Can you still confirm the employee is not breathing?",
      "The employee is not breathing.",
      /breathing/i,
    ],
  ] as const) {
    for (const answer of ["Unknown", "I cannot confirm.", "I can't confirm."]) {
      const context = input();
      context.report.text = source;
      context.turns[0].officerText = source;
      context.turns[0].state = "completed";
      context.turns[0].question = question;
      context.turns.push({
        ...context.turns[0],
        id: "22222222-2222-4222-8222-222222222222",
        officerText: answer,
        state: "processing",
      });
      const value = draft();
      value.reply = claim;
      value.assessment.summary = value.reply;
      value.assessment.indicators.immediateDanger.status = "unknown";
      value.assessment.facts[0].source.quote = source;
      expect(
        () => validateReviewedResponse({ assessment: {} }, value, context),
        answer,
      ).toThrow(issue);
    }
  }
});

it("accepts a matched current breathing confirmation and preserves original observations", () => {
  const context = input();
  context.report.text = "No breathing has been observed.";
  context.turns[0].officerText = context.report.text;
  const correction = {
    ...context.turns[0],
    id: "22222222-2222-4222-8222-222222222222",
    officerText: "The doctor confirmed the employee is not breathing.",
  };
  context.turns.push(correction);
  const value = draft();
  value.reply = "The doctor confirmed the employee is not breathing.";
  value.assessment.summary = value.reply;
  value.assessment.indicators.immediateDanger.status = "unknown";
  value.assessment.facts[0].source = {
    source: "officer",
    messageId: correction.id,
    quote: correction.officerText,
  };
  expect(
    validateReviewedResponse({ assessment: {} }, value, context).reply,
  ).toBe(value.reply);
  context.turns.push({
    ...context.turns[0],
    id: "33333333-3333-4333-8333-333333333333",
    officerText: "The visitor is breathing normally.",
  });
  expect(
    validateReviewedResponse({ assessment: {} }, value, context).reply,
  ).toBe(value.reply);
});

it("publishes no unsupported injury cause when both reviews fail to repair it", async () => {
  const recorded = voiceGroundingCases.find(
    (item: any) => item.id === "armed-robbery",
  )!;
  const context = input();
  context.report.text = recorded.sourceTranscript;
  context.turns[0].id = recorded.assessment.facts[0].source.messageId;
  context.turns[0].officerText = recorded.sourceTranscript;
  const value = {
    reply: recorded.reply,
    question: null,
    suggestedReplies: [],
    assessment: recorded.assessment,
  };
  transport.responses.push(value, { assessment: {} }, { assessment: {} });
  const chunks: ProviderChunk[] = [];
  await expect(
    (async () => {
      for await (const chunk of provider().generate(context))
        chunks.push(chunk);
    })(),
  ).rejects.toThrow(/cause|causal/i);
  expect(chunks).toEqual([]);
  expect(transport.requests).toHaveLength(3);
});

it("repairs captured causal prose and reasons without discarding the first review or original transcript", async () => {
  const recorded = voiceGroundingCases.find(
    (item) => item.id === "armed-robbery",
  )!;
  const context = input();
  context.report.text = recorded.sourceTranscript;
  context.report.wav = new Uint8Array([1]);
  context.turns[0].id = recorded.assessment.facts[0].source.messageId;
  context.turns[0].officerText = recorded.sourceTranscript;
  const summary =
    "A knife threat and theft were reported. Separately, the employee has a minor arm injury.";
  transport.responses.push(
    {
      reply: recorded.reply,
      question: null,
      suggestedReplies: [],
      assessment: recorded.assessment,
      transcript: recorded.sourceTranscript,
    },
    { assessment: { summary } },
    {
      reply: summary,
      assessment: {
        indicators: {
          emergency: {
            status: "yes",
            reason:
              "Immediate assistance is requested following an armed robbery.",
          },
        },
      },
    },
  );
  const chunks = await collect(context);
  const result = chunks.find((chunk) => chunk.type === "result") as any;
  expect(result.response.reply).toBe(summary);
  expect(result.response.assessment.summary).toBe(summary);
  expect(result.response.transcript).toBe(recorded.sourceTranscript);
  expect(result.response.assessment.indicators.medical.status).toBe("yes");
  expect(transport.requests).toHaveLength(3);
});

it("accepts a directly cited cause without changing injury and routing indicators", () => {
  const context = input();
  context.report.text = "The suspect caused the employee's injury.";
  context.turns[0].officerText = context.report.text;
  const value = draft();
  value.reply = "The suspect caused the employee's injury.";
  value.assessment.summary = value.reply;
  value.assessment.indicators.immediateDanger.status = "unknown";
  value.assessment.facts[0].text = value.reply;
  value.assessment.facts[0].source.quote = context.report.text;
  const result = validateReviewedResponse({ assessment: {} }, value, context);
  expect(result.reply).toBe(value.reply);
  expect(result.assessment?.routing).toBe("police");
});

it("preserves the cited cause when the source first names a reporting employee", () => {
  const context = input();
  context.report.text =
    "The employee reports that the suspect caused the visitor's injury.";
  context.turns[0].officerText = context.report.text;
  const value = draft();
  value.reply = "The suspect caused the visitor's injury.";
  value.assessment.summary = value.reply;
  value.assessment.indicators.immediateDanger.status = "unknown";
  value.assessment.facts[0].source.quote = context.report.text;
  expect(
    validateReviewedResponse({ assessment: {} }, value, context).reply,
  ).toBe(value.reply);
});

it("does not borrow breathing certainty from a different person", () => {
  const context = input();
  context.report.text = "No breathing has been observed for the employee.";
  context.turns[0].officerText = context.report.text;
  const correction = {
    ...context.turns[0],
    id: "22222222-2222-4222-8222-222222222222",
    officerText: "The doctor confirmed the visitor is not breathing.",
  };
  context.turns.push(correction);
  const value = draft();
  value.reply = "The employee is not breathing.";
  value.assessment.summary = value.reply;
  value.assessment.indicators.immediateDanger.status = "unknown";
  value.assessment.facts[0].source = {
    source: "officer",
    messageId: correction.id,
    quote: correction.officerText,
  };
  expect(() =>
    validateReviewedResponse({ assessment: {} }, value, context),
  ).toThrow(/breathing/i);
});

it("rejects a breathing diagnosis whose source only reports no breathing observed", () => {
  const context = input();
  context.report.text = "No movement or breathing has been observed.";
  context.turns[0].officerText = context.report.text;
  const value = draft();
  value.reply =
    "No breathing has been observed. Based on the lack of breathing, medical support is suggested.";
  value.assessment.summary = "The person is not breathing.";
  value.assessment.indicators.immediateDanger.status = "unknown";
  value.assessment.facts[0].text = "No breathing has been observed.";
  value.assessment.facts[0].source.quote = context.report.text;
  expect(() =>
    validateReviewedResponse({ assessment: {} }, value, context),
  ).toThrow(/breathing/i);
});

it("accepts the captured fire-to-dust correction when no service is suggested", async () => {
  const captured = JSON.parse(
    await readFile("fixtures/regressions/fire-correction.json", "utf8"),
  );
  const value = { ...captured.candidate, suggestedReplies: [] };
  const context = input();
  context.report.text = captured.report;
  context.turns[0].officerText = captured.report;
  context.turns.push({
    ...context.turns[0],
    id: value.assessment.facts[0].source.messageId,
    officerText: captured.correction,
  });
  expect(() =>
    validateReviewedResponse(
      { assessment: { routing: "unclear" } },
      value,
      context,
    ),
  ).toThrow(/reported.*injur/i);
  const injuryFact = value.assessment.facts.find(
    (fact: any) => fact.source.quote === "No injuries have been reported.",
  );
  for (const quote of ["No injuries", "injuries have been reported"]) {
    injuryFact.source.quote = quote;
    expect(() =>
      validateReviewedResponse(
        { assessment: { routing: "unclear" } },
        value,
        context,
      ),
    ).toThrow(/reported.*injur/i);
  }
  injuryFact.source.quote = "No injuries have been reported.";
  const corrected = validateReviewedResponse(
    {
      reply: value.reply.replace(
        "with no fire, smoke, or injuries present",
        "with no fire or smoke present and no injuries reported",
      ),
      assessment: {
        routing: "unclear",
        summary: value.assessment.summary.replace(
          "No fire, smoke, or injuries are present.",
          "No fire or smoke is present. No injuries have been reported.",
        ),
      },
    },
    value,
    context,
  );
  expect(corrected.assessment?.routing).toBe("unclear");
});

it("does not let an older absence claim remove the current reported-injury scope", () => {
  const context = input();
  context.report.text = "No injuries are present.";
  context.turns[0].officerText = context.report.text;
  const correctionId = "22222222-2222-4222-8222-222222222222";
  context.turns.push({
    ...context.turns[0],
    id: correctionId,
    officerText: "Correction: I can only say no injuries have been reported.",
  });
  const value = draft();
  value.reply = "No injuries are present.";
  value.assessment.summary = value.reply;
  value.assessment.indicators.immediateDanger.status = "unknown";
  value.assessment.indicators.injuries = {
    status: "no",
    reason: "No injuries have been reported.",
  };
  value.assessment.facts = [
    {
      text: "Earlier absence claim",
      source: { source: "officer", messageId: id, quote: context.report.text },
      evidenceStatus: "unverified",
    },
    {
      text: "No injuries have been reported.",
      source: {
        source: "officer",
        messageId: correctionId,
        quote: "no injuries have been reported.",
      },
      evidenceStatus: "unverified",
    },
  ];
  expect(() =>
    validateReviewedResponse({ assessment: {} }, value, context),
  ).toThrow(/reported.*injur/i);
});
it("preserves reported injury scope with an identical reviewed audio transcript", () => {
  const context = input();
  context.report.text = "No injuries have been reported.";
  context.report.transcript = context.report.text;
  context.turns[0].officerText = context.report.text;
  const value = {
    ...draft(),
    assessment: {
      ...draft().assessment,
      facts: [
        {
          text: "No injuries have been reported.",
          source: { source: "transcript", quote: context.report.transcript },
          evidenceStatus: "unverified",
        },
      ],
    },
  };
  value.reply = "No injuries are present.";
  value.assessment.summary = value.reply;
  value.assessment.indicators.immediateDanger.status = "unknown";
  value.assessment.indicators.injuries = {
    status: "no",
    reason: "No injuries have been reported.",
  };
  expect(() =>
    validateReviewedResponse({ assessment: {} }, value, context),
  ).toThrow(/reported.*injur/i);
});
it("explains that other routing means Emergency when reporting a conflicting No", () => {
  const value = draft();
  const context = input();
  context.report.text = "No emergency help is needed.";
  context.turns[0].officerText = context.report.text;
  value.reply = "The officer reports no emergency help is needed.";
  value.assessment.summary = value.reply;
  value.assessment.routing = "other";
  value.assessment.indicators.immediateDanger.status = "unknown";
  value.assessment.indicators.emergency = {
    status: "no",
    reason: context.report.text,
  };
  value.assessment.facts[0].source.quote = context.report.text;
  expect(
    JSON.parse(consistencyReviewContext(value, context)).validationFeedback,
  ).toMatch(/other.*emergency.*unclear/i);
});

it("publishes an accepted draft unchanged when review has no corrections", async () => {
  const value = draft();
  value.reply = "The area is reported secured. Is personnel safety known?";
  value.assessment.indicators.immediateDanger.status = "unknown";
  transport.responses.push(value, { assessment: {} });
  const chunks = await collect();
  const response = (chunks.find((c) => c.type === "result") as any).response;
  expect(response.reply).toBe(
    "The area is reported secured. Is personnel safety known?",
  );
  expect(response.question).toBe("Is personnel safety known?");
  expect(response.suggestedReplies).toEqual(["Unknown"]);
  expect(response.assessment.facts[0].evidenceStatus).toBe("matched");
  expect(transport.requests).toHaveLength(2);
});
it("distinguishes omitted conversation fields from an explicit end of clarification", () => {
  const value = draft();
  value.reply = "The area is reported secured. Current safety is unknown.";
  value.assessment.indicators.immediateDanger.status = "unknown";
  const response = validateReviewedResponse(
    { question: null, suggestedReplies: [], assessment: {} },
    value,
    input(),
  );
  expect(response.reply).toBe(
    "The area is reported secured. Current safety is unknown.",
  );
  expect(response.question).toBeNull();
  expect(response.suggestedReplies).toEqual([]);
});
it("still rejects contradictory draft prose when review omits its reply", () => {
  expect(() =>
    validateReviewedResponse({ assessment: {} }, draft(), input()),
  ).toThrow(/Unsupported immediateDanger absence/);
});
it("retains a rejected review's prose correction when the repair only fixes its indicator", async () => {
  transport.responses.push(
    draft(),
    {
      reply: "Current safety remains unknown. Is personnel safety known?",
      assessment: {
        indicators: {
          fire: { status: "no", reason: "Fire is not mentioned." },
        },
      },
    },
    { assessment: {} },
  );
  const chunks = await collect();
  const response = (chunks.find((c) => c.type === "result") as any).response;
  expect(response.reply).toBe(
    "Current safety remains unknown. Is personnel safety known?",
  );
  expect(response.question).toBe("Is personnel safety known?");
  expect(response.assessment.indicators.fire.status).toBe("unknown");
  expect(transport.requests).toHaveLength(3);
});

it("publishes only the reviewed assessment and reply, never the contradictory draft", async () => {
  const corrected = draft();
  corrected.reply =
    "The building is reported empty and secured. Current personnel safety remains unknown.";
  corrected.assessment.indicators.immediateDanger = {
    status: "unknown",
    reason: "An empty building does not establish safety across the site.",
  };
  transport.responses.push(draft(), corrected);
  const chunks = await collect();
  expect(
    chunks
      .filter((c) => c.type === "delta")
      .map((c) => c.text)
      .join(""),
  ).toBe(corrected.reply);
  const result = chunks.find((c) => c.type === "result")!;
  expect(
    (result as any).response.assessment.indicators.immediateDanger.status,
  ).toBe("unknown");
  expect((result as any).response.assessment.unknowns).toContain(
    "Current immediate danger: Unknown",
  );
  expect(transport.requests).toHaveLength(2);
});
it("fails without exposing draft text when the consistency review fails", async () => {
  transport.responses.push(draft());
  const published: ProviderChunk[] = [];
  await expect(
    (async () => {
      for await (const chunk of provider().generate(input()))
        published.push(chunk);
    })(),
  ).rejects.toThrow("Review unavailable");
  expect(published).toEqual([]);
});
it("rejects a reviewed response with contradictory ambulance and medical recommendations", async () => {
  const corrected = draft();
  corrected.assessment.indicators.ambulance.status = "yes";
  corrected.assessment.indicators.medical.status = "no";
  transport.responses.push(draft(), corrected, corrected);
  await expect(collect()).rejects.toThrow(/ambulance/i);
  expect(transport.requests).toHaveLength(3);
});
it("uses the original transcript for review and preserves it unchanged", async () => {
  const value = input();
  value.report.wav = new Uint8Array([1, 2]);
  const transcript =
    "Caller says the ignition appears to have been tampered with.";
  transport.responses.push(
    { ...draft(), transcript },
    {
      reply: "Current safety remains unknown.",
      question: null,
      suggestedReplies: [],
      assessment: {},
    },
  );
  const chunks = await collect(value);
  expect(
    (chunks.find((c) => c.type === "result") as any).response.transcript,
  ).toBe(transcript);
  const reviewText = transport.requests[1].contents[0].parts
    .map((p: any) => p.text ?? "")
    .join("\n");
  expect(reviewText).toContain(transcript);
  expect(
    transport.requests[1].contents[0].parts.every((p: any) => !p.inlineData),
  ).toBe(true);
});
it("cannot derive medical or ambulance No from the denial of reported injuries", () => {
  const value = draft();
  value.assessment.indicators.injuries = {
    status: "no",
    reason: "No injuries have been reported.",
  };
  value.assessment.indicators.medical = {
    status: "no",
    reason: "No injuries have been reported.",
  };
  value.assessment.indicators.ambulance = {
    status: "no",
    reason: "No injuries have been reported.",
  };
  value.assessment.indicators.immediateDanger = {
    status: "no",
    reason: "The building is empty and secured.",
  };
  const response = validateReviewedResponse(
    {
      reply:
        "No injuries were reported. Medical and transport needs and current danger remain unknown.",
      question: null,
      suggestedReplies: [],
      assessment: {},
    },
    value,
    input(),
  );
  expect(response.assessment?.indicators?.injuries.status).toBe("no");
  expect(response.assessment?.indicators?.medical.status).toBe("unknown");
  expect(response.assessment?.indicators?.ambulance.status).toBe("unknown");
  expect(response.assessment?.indicators?.immediateDanger.status).toBe(
    "unknown",
  );
});
it("cannot use unmentioned fire as evidence for No", () => {
  const value = draft();
  value.assessment.indicators.fire = {
    status: "no",
    reason: "No fire or fire hazards are mentioned in the report.",
  };
  expect(
    JSON.parse(consistencyReviewContext(value, input())).draft.assessment
      .indicators.fire.status,
  ).toBe("unknown");
  expect(() => validateReviewedResponse(value, value, input())).toThrow(
    /unsupported/i,
  );
});
it("accepts explicit denials of medical support and ambulance need", () => {
  const value = draft();
  const text = "No medical help is needed. An ambulance is not required.";
  value.assessment.facts = [
    {
      text: "Medical help and ambulance denied",
      source: { source: "officer", messageId: id, quote: text },
      evidenceStatus: "unverified",
    },
  ];
  value.assessment.indicators.medical.status = "no";
  value.assessment.indicators.ambulance.status = "no";
  const context = input();
  context.report.text = text;
  context.turns[0].officerText = text;
  const response = validateReviewedResponse(
    {
      reply:
        "Medical help and an ambulance were explicitly reported as not required. Current danger remains unknown.",
      question: null,
      suggestedReplies: [],
      assessment: { summary: text },
    },
    value,
    context,
  );
  expect(response.assessment?.indicators?.medical.status).toBe("no");
  expect(response.assessment?.indicators?.ambulance.status).toBe("no");
});
it("merges changed review fields without losing original facts or rewriting the transcript", () => {
  const response = validateReviewedResponse(
    {
      reply: "Current safety remains unknown.",
      question: null,
      suggestedReplies: [],
      assessment: {
        indicators: {
          immediateDanger: {
            status: "unknown",
            reason: "Safety is not established.",
          },
        },
      },
    },
    draft(),
    input(),
  );
  expect(response.assessment?.facts).toHaveLength(1);
  expect(response.assessment?.routing).toBe("police");
  expect(response.assessment?.indicators?.immediateDanger.status).toBe(
    "unknown",
  );
});
it("does not treat a question or uncertain statement as an explicit denial", () => {
  for (const text of [
    "No medical help needed?",
    "I don't know if no medical help is needed.",
  ]) {
    const value = draft();
    value.assessment.facts = [
      {
        text: "Medical need is unclear",
        source: { source: "officer", messageId: id, quote: text },
        evidenceStatus: "unverified",
      },
    ];
    value.assessment.indicators.medical.status = "no";
    const context = input();
    context.report.text = text;
    context.turns[0].officerText = text;
    expect(
      JSON.parse(consistencyReviewContext(value, context)).draft.assessment
        .indicators.medical.status,
    ).toBe("unknown");
  }
});
it("rejects unsupported final negatives rather than publishing contradictory prose", () => {
  const patch = {
    reply: "No fire response is needed.",
    question: null,
    suggestedReplies: [],
    assessment: {
      summary: "No fire response is needed.",
      indicators: { fire: { status: "no", reason: "No fire is mentioned." } },
    },
  };
  expect(() => validateReviewedResponse(patch, draft(), input())).toThrow(
    /unsupported/i,
  );
});
it("checks the containing source sentence instead of trusting a selected denial substring", () => {
  for (const [text, quote, key] of [
    ["No medical help needed?", "No medical help needed", "medical"],
    ["I do not know whether there are no injuries.", "no injuries", "injuries"],
    ["No fire alarm is installed.", "No fire", "fire"],
    ["No ambulance has arrived yet.", "No ambulance", "ambulance"],
  ]) {
    const value = draft();
    value.assessment.facts = [
      {
        text: "Uncertain observation",
        source: { source: "officer", messageId: id, quote },
        evidenceStatus: "unverified",
      },
    ];
    value.assessment.indicators[key].status = "no";
    const context = input();
    context.report.text = text;
    context.turns[0].officerText = text;
    expect(
      JSON.parse(consistencyReviewContext(value, context)).draft.assessment
        .indicators[key].status,
    ).toBe("unknown");
  }
});
it("rejects a definite summary of a condition reported only as apparent", () => {
  const value = draft();
  const text = "The ignition appears to have been tampered with.";
  value.assessment.facts = [
    {
      text,
      source: { source: "officer", messageId: id, quote: text },
      evidenceStatus: "unverified",
    },
  ];
  value.assessment.summary = text;
  const context = input();
  context.report.text = text;
  context.turns[0].officerText = text;
  expect(() =>
    validateReviewedResponse(
      {
        reply: "The vehicle has a tampered ignition.",
        question: null,
        suggestedReplies: [],
        assessment: { summary: "The vehicle has a tampered ignition." },
      },
      value,
      context,
    ),
  ).toThrow(/qualifier/i);
});
it("rejects unsupported absence in prose even when the indicator already says Unknown", () => {
  expect(() =>
    validateReviewedResponse(
      {
        reply: "No fire response is needed.",
        question: null,
        suggestedReplies: [],
        assessment: {},
      },
      draft(),
      input(),
    ),
  ).toThrow(/unsupported/i);
});
it("reports both unsupported absence and lost qualifiers in the single repair request", () => {
  const context = input();
  context.report.text = "The ignition appears to have been tampered with.";
  context.turns[0].officerText = context.report.text;
  const value = draft();
  value.assessment.facts = [];
  const patch = {
    reply: "Review required.",
    question: null,
    suggestedReplies: [],
    assessment: {
      summary:
        "The vehicle has a tampered ignition. No injuries have been reported.",
    },
  };
  let message = "";
  try {
    validateReviewedResponse(patch, value, context);
  } catch (e) {
    message = (e as Error).message;
  }
  expect(message).toMatch(/Unsupported injuries absence/);
  expect(message).toMatch(/qualifier lost in assessment.summary/);
});
it("includes prose defects even when the same candidate has cross-field indicator conflicts", () => {
  const context = input();
  context.report.text = "The ignition appears to have been tampered with.";
  context.turns[0].officerText = context.report.text;
  const value = draft();
  value.assessment.facts = [];
  value.assessment.indicators.emergency.status = "yes";
  value.assessment.indicators.ambulance.status = "yes";
  let message = "";
  try {
    validateReviewedResponse(
      {
        reply: "No injuries have been reported.",
        question: null,
        suggestedReplies: [],
        assessment: { summary: "The vehicle has a tampered ignition." },
      },
      value,
      context,
    );
  } catch (error) {
    message = (error as Error).message;
  }
  expect(message).toMatch(/Emergency Yes conflicts/);
  expect(message).toMatch(/Ambulance recommendation/);
  expect(message).toMatch(/Unsupported injuries absence/);
  expect(message).toMatch(/qualifier lost in assessment.summary/);
});
it("lets a matched later confirmation supersede an apparent condition", () => {
  const original = "The ignition appears to have been tampered with.";
  const correction =
    "Correction: inspection confirms the ignition is tampered with.";
  const value = draft();
  const context = input();
  context.report.text = original;
  context.turns[0].officerText = original;
  const correctionId = "00000000-0000-4000-8000-000000000002";
  context.turns.push({
    ...context.turns[0],
    id: correctionId,
    officerText: correction,
  });
  value.assessment.facts = [
    {
      text: "The ignition is reported confirmed tampered with following the correction.",
      source: { source: "officer", messageId: correctionId, quote: correction },
      evidenceStatus: "unverified",
    },
  ];
  const patch = {
    reply:
      "The ignition is reported confirmed tampered with following the correction.",
    question: null,
    suggestedReplies: [],
    assessment: {
      summary:
        "The ignition is reported confirmed tampered with following the correction.",
    },
  };
  expect(() => validateReviewedResponse(patch, value, context)).not.toThrow();
  context.turns[1].officerText =
    "Correction: inspection cannot confirm the ignition is tampered with.";
  value.assessment.facts[0].source.quote = context.turns[1].officerText;
  expect(() => validateReviewedResponse(patch, value, context)).toThrow(
    /qualifier/i,
  );
});
it("does not let an old injury denial override a later correction or an Unknown answer", () => {
  for (const update of [
    "Correction: an employee has a bleeding arm injury.",
    "Correction: a warehouse employee has a minor cut on his arm and medical support is needed.",
    "Correction: I cannot confirm whether there are any injuries.",
    "Unknown",
  ]) {
    const context = input();
    context.turns[0].state = "completed";
    context.turns[0].question = "Are there any injuries?";
    context.turns.push({
      ...context.turns[0],
      id: "22222222-2222-4222-8222-222222222222",
      officerText: update,
      state: "processing",
    });
    const value = draft();
    value.reply = "No injuries have been reported.";
    value.assessment.summary = value.reply;
    value.assessment.indicators.immediateDanger.status = "unknown";
    value.assessment.indicators.injuries = {
      status: "no",
      reason: "No injuries have been reported.",
    };
    expect(() =>
      validateReviewedResponse(
        {
          assessment: {
            indicators: { injuries: value.assessment.indicators.injuries },
          },
        },
        value,
        context,
      ),
    ).toThrow(/injuries absence/i);
  }
});
it("retains a current explicit denial after an unrelated officer update", () => {
  const context = input();
  context.turns.push({
    ...context.turns[0],
    id: "22222222-2222-4222-8222-222222222222",
    officerText: "The incident location is the north entrance.",
  });
  const value = draft();
  value.reply = "No injuries have been reported. Current safety is unknown.";
  value.assessment.summary = value.reply;
  value.assessment.indicators.immediateDanger.status = "unknown";
  value.assessment.indicators.injuries = {
    status: "no",
    reason: "No injuries have been reported.",
  };
  expect(
    validateReviewedResponse({ assessment: {} }, value, context).assessment
      ?.indicators?.injuries.status,
  ).toBe("no");
});
it("applies current-source checks to medical, ambulance and fire denials too", () => {
  for (const [key, original, update] of [
    [
      "medical",
      "No medical support is needed.",
      "Correction: medical support is now needed.",
    ],
    [
      "ambulance",
      "An ambulance is not required.",
      "Correction: ambulance need is now unknown.",
    ],
    [
      "fire",
      "No fire is present.",
      "Update: smoke is now coming from the storage room.",
    ],
  ]) {
    const context = input();
    context.report.text = original;
    context.turns[0].officerText = original;
    context.turns.push({
      ...context.turns[0],
      id: "22222222-2222-4222-8222-222222222222",
      officerText: update,
    });
    const value = draft();
    value.reply = original;
    value.assessment.summary = original;
    value.assessment.facts[0].source.quote = original;
    value.assessment.indicators.immediateDanger.status = "unknown";
    const indicator = { status: "no", reason: original };
    value.assessment.indicators[key] = indicator;
    expect(() =>
      validateReviewedResponse(
        { assessment: { indicators: { [key]: indicator } } },
        value,
        context,
      ),
    ).toThrow(new RegExp(`${key} absence`, "i"));
  }
});
it("rejects a denial from original audio after a later officer correction without changing the transcript", () => {
  const context = input();
  context.report = { transcript: "No injuries have been reported." };
  context.turns[0].officerText = "";
  context.turns.push({
    ...context.turns[0],
    id: "22222222-2222-4222-8222-222222222222",
    officerText: "Correction: an employee has an injury.",
  });
  const value = draft();
  value.reply = "No injuries have been reported.";
  value.assessment.summary = value.reply;
  value.assessment.facts = [
    {
      text: value.reply,
      source: { source: "transcript", quote: context.report.transcript },
      evidenceStatus: "unverified",
    },
  ] as any;
  value.assessment.indicators.immediateDanger.status = "unknown";
  value.assessment.indicators.injuries = { status: "no", reason: value.reply };
  expect(() =>
    validateReviewedResponse(
      {
        assessment: {
          indicators: { injuries: value.assessment.indicators.injuries },
        },
      },
      value,
      context,
    ),
  ).toThrow(/injuries absence/i);
  expect(context.report.transcript).toBe("No injuries have been reported.");
});
it("publishes no stale denial when both model reviews ignore an officer correction", async () => {
  const context = input();
  context.turns.push({
    ...context.turns[0],
    id: "22222222-2222-4222-8222-222222222222",
    officerText: "Correction: an employee has an injury.",
  });
  const value = draft();
  value.reply = "No injuries have been reported.";
  value.assessment.summary = value.reply;
  value.assessment.indicators.immediateDanger.status = "unknown";
  value.assessment.indicators.injuries = { status: "no", reason: value.reply };
  transport.responses.push(value, { assessment: {} }, { assessment: {} });
  const published: ProviderChunk[] = [];
  await expect(
    (async () => {
      for await (const chunk of provider().generate(context))
        published.push(chunk);
    })(),
  ).rejects.toThrow(/injuries absence/i);
  expect(published).toEqual([]);
  expect(transport.requests).toHaveLength(3);
});
it("does not use an empty confirmation citation or a withdrawn confirmation to remove apparent scope", () => {
  for (const withdrawn of [false, true]) {
    const context = input();
    context.report.text = "The ignition appears to have been tampered with.";
    context.turns[0].officerText = context.report.text;
    const confirmationId = "22222222-2222-4222-8222-222222222222";
    const confirmation =
      "Correction: inspection confirms the ignition is tampered with.";
    context.turns.push({
      ...context.turns[0],
      id: confirmationId,
      officerText: confirmation,
    });
    if (withdrawn)
      context.turns.push({
        ...context.turns[0],
        id: "33333333-3333-4333-8333-333333333333",
        officerText:
          "Correction: I cannot confirm whether the ignition is tampered with.",
      });
    const value = draft();
    value.reply = "The ignition is reported confirmed tampered with.";
    value.assessment.summary = value.reply;
    value.assessment.indicators.immediateDanger.status = "unknown";
    value.assessment.facts = [
      {
        text: value.reply,
        source: {
          source: "officer",
          messageId: confirmationId,
          quote: withdrawn ? confirmation : "",
        },
        evidenceStatus: "unverified",
      },
    ];
    expect(() =>
      validateReviewedResponse({ assessment: {} }, value, context),
    ).toThrow(/qualifier/i);
  }
});
it("accepts a current matched disconfirmation without allowing unsupported or withdrawn negation", () => {
  const context = input();
  context.report.text =
    "A white plume that appears to be smoke is coming from the machine.";
  context.turns[0].officerText = context.report.text;
  const correctionId = "22222222-2222-4222-8222-222222222222";
  context.turns.push({
    ...context.turns[0],
    id: correctionId,
    officerText:
      "Inspection confirms the white plume was dust. No fire or smoke is present.",
  });
  const value = draft();
  value.assessment.indicators.immediateDanger.status = "unknown";
  value.reply = "Inspection confirms the plume was dust, not smoke.";
  value.assessment.summary = value.reply;
  value.assessment.facts = [
    {
      text: "No fire or smoke is present.",
      source: {
        source: "officer",
        messageId: correctionId,
        quote: "No fire or smoke is present.",
      },
      evidenceStatus: "unverified",
    },
  ];
  expect(
    validateReviewedResponse({ assessment: {} }, value, context).reply,
  ).toBe(value.reply);
  const correction = context.turns.at(-1)!;
  value.assessment.facts[0].source.quote = correction.officerText;
  expect(
    validateReviewedResponse({ assessment: {} }, value, context).reply,
  ).toBe(value.reply);
  for (const uncertain of [
    "I don't know if there is no smoke.",
    "I am not sure there is no smoke.",
    "It is uncertain whether there is no smoke.",
    "Is there no smoke?",
    "No smoke is present. Correction: I do not know whether the plume is smoke.",
  ]) {
    correction.officerText = uncertain;
    value.assessment.facts[0].source.quote = uncertain;
    expect(() =>
      validateReviewedResponse({ assessment: {} }, value, context),
    ).toThrow(/qualifier/i);
  }
  correction.officerText =
    "Inspection confirms the white plume was dust. No fire or smoke is present.";
  value.assessment.facts[0].source.quote = correction.officerText;
  const positive = { ...value, reply: "The plume is smoke." };
  expect(() =>
    validateReviewedResponse({ assessment: {} }, positive, context),
  ).toThrow(/qualifier/i);
  const unsupported = {
    ...value,
    assessment: { ...value.assessment, facts: [] },
  };
  expect(() =>
    validateReviewedResponse({ assessment: {} }, unsupported, context),
  ).toThrow(/qualifier/i);
  context.turns.push({
    ...context.turns[0],
    id: "33333333-3333-4333-8333-333333333333",
    officerText: "Correction: whether the plume is smoke is now unknown.",
  });
  expect(() =>
    validateReviewedResponse({ assessment: {} }, value, context),
  ).toThrow(/qualifier/i);
});
it("tracks the object of a relative-clause observation instead of treating 'that' as its subject", () => {
  const context = input();
  context.report.text =
    "A white plume that appears to be smoke is coming from the machine.";
  context.turns[0].officerText = context.report.text;
  const value = draft();
  value.assessment.facts = [];
  value.assessment.indicators.immediateDanger.status = "unknown";
  value.reply = "The plume is smoke.";
  value.assessment.summary = value.reply;
  expect(() =>
    validateReviewedResponse({ assessment: {} }, value, context),
  ).toThrow(/apparent plume condition/);
  value.reply = "A white plume appearing to be smoke is reported.";
  value.assessment.summary = value.reply;
  expect(
    validateReviewedResponse({ assessment: {} }, value, context).reply,
  ).toBe(value.reply);
  const correction =
    "Inspection confirms the white plume was dust. No fire or smoke is present.";
  const correctionId = "22222222-2222-4222-8222-222222222222";
  context.turns.push({
    ...context.turns[0],
    id: correctionId,
    officerText: correction,
  });
  value.reply =
    "Thank you for confirming that no fire or smoke is present. The white plume was dust.";
  value.assessment.summary = value.reply;
  value.assessment.facts = [
    {
      text: "No fire or smoke is present.",
      source: {
        source: "officer",
        messageId: correctionId,
        quote: "No fire or smoke is present.",
      },
      evidenceStatus: "unverified",
    },
  ];
  value.assessment.indicators.fire = {
    status: "no",
    reason: "No fire or smoke is present.",
  };
  expect(
    validateReviewedResponse({ assessment: {} }, value, context).assessment
      ?.indicators?.fire.status,
  ).toBe("no");
});
it("includes independent priority and qualifier defects in the first review context without mutating the draft", () => {
  const context = input();
  context.report.text = "The ignition appears to have been tampered with.";
  context.turns[0].officerText = context.report.text;
  const value = draft();
  value.reply = "The vehicle has a tampered ignition.";
  value.assessment.summary = value.reply;
  value.assessment.facts = [];
  value.assessment.indicators.immediateDanger.status = "unknown";
  value.assessment.indicators.emergency.status = "yes";
  const original = JSON.stringify(value);
  const review = JSON.parse(consistencyReviewContext(value, context));
  expect(review.validationFeedback).toMatch(/Emergency Yes conflicts/);
  expect(review.validationFeedback).toMatch(/qualifier lost/);
  expect(JSON.stringify(value)).toBe(original);
});
it("makes at most one repair attempt for a rejected review and publishes only a valid reply", async () => {
  const rejected = {
    reply: "No fire response is needed.",
    question: null,
    suggestedReplies: [],
    assessment: {
      indicators: { fire: { status: "no", reason: "Fire is not mentioned." } },
    },
  };
  const corrected = {
    reply: "Fire response need and current safety remain unknown.",
    question: null,
    suggestedReplies: [],
    assessment: {},
  };
  transport.responses.push(draft(), rejected, corrected);
  const chunks = await collect();
  expect(
    chunks
      .filter((c) => c.type === "delta")
      .map((c) => c.text)
      .join(""),
  ).toBe(corrected.reply);
  expect(transport.requests).toHaveLength(3);
});
it("preserves earlier review corrections when the repair changes only the remaining defect", async () => {
  const context = input();
  const text = "The ignition appears to have been tampered with.";
  context.report.text = text;
  context.turns[0].officerText = text;
  const original = draft();
  original.assessment.summary = "The vehicle has a tampered ignition.";
  original.assessment.facts = [
    {
      text,
      source: { source: "officer", messageId: id, quote: text },
      evidenceStatus: "unverified",
    },
  ];
  original.assessment.indicators.emergency = {
    status: "yes",
    reason: "Suspect status is unknown.",
  };
  const reviewedSummary =
    "The ignition appears to have been tampered with. Current danger remains unknown.";
  const firstReview = {
    reply: "No injuries have been reported.",
    question: null,
    suggestedReplies: [],
    assessment: {
      summary: reviewedSummary,
      indicators: {
        emergency: {
          status: "unknown",
          reason: "No urgent assistance was established.",
        },
      },
    },
  };
  const repair = {
    reply: "Injuries and current danger remain unknown.",
    question: null,
    suggestedReplies: [],
    assessment: {},
  };
  transport.responses.push(original, firstReview, repair);
  const chunks = await collect(context);
  const result = (chunks.find((c) => c.type === "result") as any).response;
  expect(result.assessment.summary).toBe(reviewedSummary);
  expect(result.assessment.indicators.emergency.status).toBe("unknown");
  expect(result.assessment.urgency).toBe("standard_review");
  expect(
    chunks
      .filter((c) => c.type === "delta")
      .map((c) => c.text)
      .join(""),
  ).toBe(repair.reply);
});
it("retains the original audio transcript when repairing a partially corrected review", async () => {
  const context = input();
  context.report.wav = new Uint8Array([1, 2]);
  const transcript =
    "The caller says the ignition appears to have been tampered with.";
  const summary =
    "The caller reports an ignition that appears to have been tampered with.";
  transport.responses.push(
    { ...draft(), transcript },
    {
      reply: "No fire response is needed.",
      question: null,
      suggestedReplies: [],
      assessment: { summary },
    },
    {
      reply: "Fire response need remains unknown.",
      question: null,
      suggestedReplies: [],
      assessment: {},
    },
  );
  const result = (await collect(context)).find(
    (c) => c.type === "result",
  ) as any;
  expect(result.response.transcript).toBe(transcript);
  expect(result.response.assessment.summary).toBe(summary);
});
it("does not retain fields from a review that fails schema validation", async () => {
  const original = draft();
  transport.responses.push(
    original,
    {
      reply: "Invalid review.",
      question: null,
      suggestedReplies: [],
      assessment: { summary: "Unsafe replacement", urgency: "verified" },
    },
    {
      reply: "Current safety remains unknown.",
      question: null,
      suggestedReplies: [],
      assessment: {},
    },
  );
  const result = (await collect()).find((c) => c.type === "result") as any;
  expect(result.response.assessment.summary).toBe(
    "The building is reported empty and secured. Personnel safety is unknown.",
  );
});
it("accepts the captured vehicle repair without undoing the earlier Emergency Unknown correction", async () => {
  const recorded = JSON.parse(
    await readFile(
      "fixtures/regressions/recovered-vehicle-repair.json",
      "utf8",
    ),
  );
  const context = input();
  context.report.text = recorded.report;
  context.turns[0].id = recorded.messageId;
  context.turns[0].officerText = recorded.report;
  transport.responses.push(...recorded.responses);
  const result = (await collect(context)).find(
    (c) => c.type === "result",
  ) as any;
  expect(result.response.assessment.urgency).toBe("standard_review");
  expect(result.response.assessment.indicators.emergency.status).toBe(
    "unknown",
  );
  expect(result.response.assessment.summary).toContain(
    "ignition that appears to have been tampered with",
  );
  expect(
    result.response.assessment.facts.every(
      (fact: any) => fact.evidenceStatus === "matched",
    ),
  ).toBe(true);
});

it("keeps clarification instruction overhead bounded while preserving sources and full review", async () => {
  const context = input();
  const value = draft();
  value.reply =
    "The area is reported secured. Current personnel safety remains unknown.";
  value.assessment.indicators.immediateDanger.status = "unknown";
  context.turns[0] = {
    ...context.turns[0],
    state: "completed",
    reply: value.reply,
    question: value.question,
  };
  context.turns.push({
    ...context.turns[0],
    id: "22222222-2222-4222-8222-222222222222",
    kind: "message",
    officerText: "Unknown",
    state: "processing",
    reply: undefined,
    question: undefined,
  });
  context.assessment = structuredClone(value.assessment) as any;
  context.intake = { questionsAsked: 1, forceFinish: false };
  transport.responses.push(value, { assessment: {} });
  const chunks = await collect(context);
  const contents = transport.requests[0].contents[0].parts
    .map((part: any) => part.text)
    .join("\n");
  // The full report and message IDs remain available. Bound added instructions,
  // not source length: duplicated audit rules stalled real clarification calls.
  const source = buildConversationContext(context);
  expect(contents).toContain(source);
  expect(Buffer.byteLength(contents) - Buffer.byteLength(source)).toBeLessThan(
    3000,
  );
  expect(transport.requests).toHaveLength(2);
  const review = JSON.parse(transport.requests[1].contents[0].parts[0].text);
  expect(review.sourceContext.messages.at(-1).officer).toBe("Unknown");
  const response = (chunks.find((chunk) => chunk.type === "result") as any)
    .response;
  expect(response.assessment.facts[0].evidenceStatus).toBe("matched");
  expect(response.assessment.indicators.immediateDanger.status).toBe("unknown");
});

it("withholds an unsafe clarification draft when the complete consistency review cannot repair it", async () => {
  const context = input();
  context.turns[0].state = "completed";
  context.turns[0].question = "Is personnel safety known?";
  context.turns.push({
    ...context.turns[0],
    id: "22222222-2222-4222-8222-222222222222",
    kind: "message",
    officerText: "Unknown",
    state: "processing",
  });
  context.assessment = draft().assessment as any;
  transport.responses.push(draft(), { assessment: {} }, { assessment: {} });
  const chunks: ProviderChunk[] = [];
  await expect(
    (async () => {
      for await (const chunk of provider().generate(context))
        chunks.push(chunk);
    })(),
  ).rejects.toThrow(/Unsupported immediateDanger absence/);
  expect(chunks).toEqual([]);
  expect(transport.requests).toHaveLength(3);
});

function acceptedDraft() {
  const value = draft();
  value.reply =
    "The area is reported secured. Current personnel safety remains unknown.";
  value.assessment.indicators.immediateDanger.status = "unknown";
  return value;
}

it.each([429, 503, 504])(
  "recovers one transient draft failure (%i) before publishing a reviewed response",
  async (status) => {
    vi.useFakeTimers();
    try {
      transport.responses.push(
        new ApiError({ status, message: "private upstream failure" }),
        acceptedDraft(),
        { assessment: {} },
      );
      const pending = collect();
      const outcome = pending.then(
        (value) => ({ value, error: undefined }),
        (error) => ({ value: undefined, error }),
      );
      await vi.runAllTimersAsync();
      const result = await outcome;
      expect(result.error).toBeUndefined();
      expect(result.value).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: "result" })]),
      );
      expect(transport.requests).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  },
);

it("retries a failed review without regenerating the completed draft", async () => {
  vi.useFakeTimers();
  try {
    transport.responses.push(
      acceptedDraft(),
      new ApiError({ status: 504, message: "private upstream failure" }),
      { assessment: {} },
    );
    const pending = collect();
    const outcome = pending.then(
      (value) => ({ value, error: undefined }),
      (error) => ({ value: undefined, error }),
    );
    await vi.runAllTimersAsync();
    const result = await outcome;
    expect(result.error).toBeUndefined();
    expect(result.value).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "result" })]),
    );
    expect(transport.requests).toHaveLength(3);
    expect(transport.requests[2].contents).toEqual(
      transport.requests[1].contents,
    );
    expect(
      JSON.parse(transport.requests[2].contents[0].parts[0].text).draft.reply,
    ).toBe(acceptedDraft().reply);
  } finally {
    vi.useRealTimers();
  }
});

it("allows only one transient recovery across draft and review and publishes no incomplete result", async () => {
  vi.useFakeTimers();
  try {
    const failure = new ApiError({
      status: 503,
      message: "private upstream failure",
    });
    transport.responses.push(failure, acceptedDraft(), failure, {
      assessment: {},
    });
    const chunks: ProviderChunk[] = [];
    const pending = (async () => {
      for await (const chunk of provider().generate(input()))
        chunks.push(chunk);
    })();
    const verified = expect(pending).rejects.toBe(failure);
    await vi.runAllTimersAsync();
    await verified;
    expect(transport.requests).toHaveLength(3);
    expect(chunks).toEqual([]);
  } finally {
    vi.useRealTimers();
  }
});

it("cancels transient recovery before issuing another model request", async () => {
  vi.useFakeTimers();
  try {
    const controller = new AbortController();
    const context = { ...input(), signal: controller.signal };
    transport.responses.push(
      new ApiError({ status: 503, message: "private upstream failure" }),
      acceptedDraft(),
      { assessment: {} },
    );
    const pending = collect(context);
    const failed = pending.catch((error) => error);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await vi.runAllTimersAsync();
    expect(await failed).toMatchObject({ name: "AbortError" });
    expect(transport.requests).toHaveLength(1);
  } finally {
    vi.useRealTimers();
  }
});
