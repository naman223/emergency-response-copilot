import { isDeepStrictEqual } from "node:util";

export type Expectation = {
  urgency?: string;
  indicators: Record<string, string>;
};
export type VoiceCase = {
  id: string;
  kind: "speech" | "non-speech";
  language: "en" | "hi";
  script: string;
  voice?: "Samantha" | "Rishi" | "Lekha";
  rate?: number;
  filter?: string;
  signal?: "silence" | "noise";
  concepts: string[][];
  location?: { includes: string[]; excludes: string[] };
  initial?: Expectation;
  correction?: { text: string; expected: Expectation };
  audio: string;
  sha256?: string;
  durationSeconds?: number;
};
export function runOptions(args: string[], ids: string[]) {
  const values = new Map<string, string>();
  for (const argument of args) {
    const match = /^--(passes|case|output)=(.+)$/.exec(argument);
    if (!match || values.has(match[1]))
      throw Error(
        "Use unique --passes=1|2, --case=ID, --output=docs/NAME.json",
      );
    values.set(match[1], match[2]);
  }
  const count = values.get("passes") ?? "2";
  if (!/^[12]$/.test(count)) throw Error("At most two passes are allowed");
  const selected = values.get("case");
  if (selected && !ids.includes(selected))
    throw Error("Unknown evaluation case");
  const output = values.get("output") ?? "docs/voice-matrix-results.json";
  if (!/^docs\/[a-zA-Z0-9._-]+\.json$/.test(output))
    throw Error("Output must be a JSON file directly under docs");
  return { passes: Number(count), selected, output };
}
export function requireLocalEmulators(env: NodeJS.ProcessEnv) {
  for (const key of [
    "FIRESTORE_EMULATOR_HOST",
    "FIREBASE_AUTH_EMULATOR_HOST",
    "FIREBASE_STORAGE_EMULATOR_HOST",
  ]) {
    const match = /^127\.0\.0\.1:(\d+)$/.exec(env[key] ?? "");
    if (!match || Number(match[1]) < 1 || Number(match[1]) > 65535)
      throw Error("Loopback Firebase emulators are required");
  }
}
export function checkPreview(
  scenario: Pick<VoiceCase, "kind" | "language" | "concepts" | "location">,
  preview: { transcript: string; locationDescription: string | null },
) {
  const issues: string[] = [];
  if (scenario.kind === "non-speech") {
    if (preview.transcript.trim())
      issues.push("Invented speech for non-speech input; inspect manually");
    if (preview.locationDescription)
      issues.push("Invented location for non-speech input");
    return issues;
  }
  issues.push(...checkTranscript(scenario, preview.transcript));
  const location = preview.locationDescription?.toLocaleLowerCase() ?? "";
  if (scenario.location) {
    if (
      !scenario.location.includes.some((word) =>
        location.includes(word.toLocaleLowerCase()),
      )
    )
      issues.push("Expected incident location was not extracted");
    if (
      scenario.location.excludes.some((word) =>
        location.includes(word.toLocaleLowerCase()),
      )
    )
      issues.push("Caller or other location was selected as incident location");
  } else if (preview.locationDescription)
    issues.push(
      "Location extracted from a script without an incident location",
    );
  return issues;
}
export function checkTranscript(
  scenario: Pick<VoiceCase, "language" | "concepts">,
  transcript: string,
) {
  const issues: string[] = [];
  const text = transcript.toLocaleLowerCase();
  if (!text.trim()) issues.push("No intelligible transcript for spoken sample");
  if (scenario.language === "hi" && !/\p{Script=Devanagari}/u.test(text))
    issues.push("Transcript did not retain original Hindi script");
  for (const alternatives of scenario.concepts)
    if (
      !alternatives.some((phrase) => text.includes(phrase.toLocaleLowerCase()))
    )
      issues.push(`Missing scripted concept: ${alternatives.join(" / ")}`);
  return issues;
}
type PersistedSnapshot = {
  incident: {
    assessment?: unknown;
    sourceTranscript?: unknown;
    reportText?: unknown;
    clarifications?: unknown;
  };
  turns: unknown;
};
export function checkReload(
  before: PersistedSnapshot,
  after: PersistedSnapshot,
) {
  const issues: string[] = [];
  for (const key of [
    "assessment",
    "sourceTranscript",
    "reportText",
    "clarifications",
  ] as const)
    if (!isDeepStrictEqual(before.incident[key], after.incident[key]))
      issues.push(`Reload changed ${key}`);
  if (!isDeepStrictEqual(before.turns, after.turns))
    issues.push("Reload changed turn history");
  return issues;
}
export function checkAssessment(
  expected: Expectation,
  assessment: {
    urgency: string;
    indicators?: Record<string, { status: string }>;
    facts: Array<{ evidenceStatus: string }>;
    summary: string;
  },
  reply: string,
) {
  const issues: string[] = [];
  if (expected.urgency && assessment.urgency !== expected.urgency)
    issues.push(
      `Priority expected ${expected.urgency}, received ${assessment.urgency}`,
    );
  for (const [key, status] of Object.entries(expected.indicators))
    if (assessment.indicators?.[key]?.status !== status)
      issues.push(
        `${key}: expected ${status}, received ${assessment.indicators?.[key]?.status ?? "missing"}`,
      );
  if (assessment.facts.some((fact) => fact.evidenceStatus !== "matched"))
    issues.push("Unmatched evidence quote");
  if (
    /\b(?:dead|deceased|not breathing|non-breathing)\b/i.test(
      `${reply}\n${assessment.summary}`,
    )
  )
    issues.push(
      "Medical wording needs manual review for unsupported certainty",
    );
  return issues;
}
