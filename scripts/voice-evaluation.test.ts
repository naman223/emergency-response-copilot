import { expect, it } from "vitest";
import {
  checkPreview,
  checkAssessment,
  runOptions,
  requireLocalEmulators,
  checkTranscript,
  checkReload,
} from "./voice-evaluation";

it("requires finite selected passes and rejects unknown cases", () => {
  expect(runOptions([], ["a"]).passes).toBe(2);
  for (const argument of [
    "--passes=0",
    "--passes=3",
    "--passes=Infinity",
    "--passes=1.5",
    "--case=missing",
    "--unexpected",
  ]) {
    expect(() => runOptions([argument], ["a"])).toThrow();
  }
  expect(
    runOptions(["--passes=1", "--case=a", "--output=docs/check.json"], ["a"]),
  ).toMatchObject({ passes: 1, selected: "a", output: "docs/check.json" });
});
it("refuses missing or non-loopback Firebase hosts", () => {
  const env = {
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:8182",
    FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
    FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199",
  };
  expect(() => requireLocalEmulators(env)).not.toThrow();
  for (const value of [
    undefined,
    "cloud:443",
    "127.0.0.1:9099@remote",
    "127.0.0.1:99999",
  ])
    expect(() =>
      requireLocalEmulators({ ...env, FIRESTORE_EMULATOR_HOST: value }),
    ).toThrow();
});
it("flags invented speech and location for non-speech recordings", () => {
  const scenario = {
    kind: "non-speech" as const,
    language: "en" as const,
    concepts: [],
  };
  expect(
    checkPreview(scenario, { transcript: "", locationDescription: null }),
  ).toEqual([]);
  expect(
    checkPreview(scenario, {
      transcript: "Help",
      locationDescription: "Chennai",
    }),
  ).toHaveLength(2);
});
it("checks original Hindi script, concept alternatives and incident-versus-caller location", () => {
  const scenario = {
    kind: "speech" as const,
    language: "hi" as const,
    concepts: [["चाकू"], ["चोट", "जख्म"]],
    location: { includes: ["बेंगलुरु", "बैंगलोर"], excludes: ["हैदराबाद"] },
  };
  expect(
    checkPreview(scenario, {
      transcript: "बेंगलुरु में चाकू और चोट",
      locationDescription: "बेंगलुरु",
    }),
  ).toEqual([]);
  const issues = checkPreview(scenario, {
    transcript: "A knife in Bengaluru",
    locationDescription: "हैदराबाद",
  });
  expect(issues).toEqual(
    expect.arrayContaining([
      expect.stringContaining("original Hindi"),
      expect.stringContaining("concept"),
      expect.stringContaining("incident location"),
      expect.stringContaining("other location"),
    ]),
  );
});
it("flags each mismatched expected indicator and dangerous wording without scoring accuracy", () => {
  const expected = {
    urgency: "urgent_review",
    indicators: { medical: "yes", injuries: "unknown" },
  };
  expect(
    checkAssessment(
      expected,
      {
        urgency: "standard_review",
        indicators: { medical: { status: "no" }, injuries: { status: "yes" } },
        facts: [{ evidenceStatus: "unverified" }],
        summary: "The person is not breathing.",
      },
      "The person is deceased.",
    ),
  ).toHaveLength(5);
  expect(
    checkAssessment(
      expected,
      {
        urgency: "urgent_review",
        indicators: {
          medical: { status: "yes" },
          injuries: { status: "unknown" },
        },
        facts: [{ evidenceStatus: "matched" }],
        summary: "No breathing has been observed.",
      },
      "Reported unresponsive.",
    ),
  ).toEqual([]);
});

it("checks concepts in the original audio transcript independently of the editable preview", () => {
  expect(
    checkTranscript(
      { language: "en", concepts: [["knife"], ["injury", "injured"]] },
      "hello",
    ),
  ).toHaveLength(2);
  expect(
    checkTranscript(
      { language: "en", concepts: [["knife"], ["injury", "injured"]] },
      "Knife reported and employee injured.",
    ),
  ).toEqual([]);
});
it("detects replaced clarification content and changed turns even when counts match", () => {
  const before = {
    incident: {
      assessment: {},
      sourceTranscript: "Original",
      reportText: "Reviewed",
      clarifications: [
        {
          question: "Injuries?",
          answer: "Unknown",
          assessmentState: "included",
        },
      ],
    },
    turns: [{ id: "one", reply: "Original reply", state: "completed" }],
  };
  expect(checkReload(before, structuredClone(before))).toEqual([]);
  const altered = structuredClone(before);
  altered.incident.clarifications[0].answer = "No";
  altered.turns[0].reply = "Changed reply";
  expect(checkReload(before, altered)).toHaveLength(2);
});
