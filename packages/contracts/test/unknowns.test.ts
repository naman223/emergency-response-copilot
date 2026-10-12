import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import {
  validateCoordinatorResponse,
  type CoordinatorResponse,
} from "../src/index";

const id = "11111111-1111-4111-8111-111111111111";
const response = (unknowns: string[]): CoordinatorResponse => ({
  reply: "Reported details remain uncertain. Human review is required.",
  question: null,
  suggestedReplies: [],
  assessment: {
    summary: "Reported details remain uncertain.",
    facts: [],
    unknowns,
    urgency: "unclear",
    routing: "unclear",
    locationDescription: "",
  },
});
const parse = (value: CoordinatorResponse, messages = {}) =>
  validateCoordinatorResponse(value, { messages }, false);

it("collapses four duplicate gaps in the captured incident while retaining every clarification fact", async () => {
  const captured = JSON.parse(
    await readFile(
      new URL(
        "../../../fixtures/regressions/duplicate-unknowns.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const result = validateCoordinatorResponse(
    captured.response,
    captured.sources,
    false,
  );
  expect(result.assessment?.unknowns).toEqual([
    "Ambulance need: Unknown",
    "Fire response need: Unknown",
    "Current immediate danger: Unknown",
    "It is unknown whether the suspect is inside or outside the facility perimeter.",
    "It is unknown whether the injured employee requires an ambulance or if first aid is sufficient.",
    "It is unknown whether other personnel at the facility are currently secure and safe.",
    "It is unknown whether there are any indications of current immediate danger to anyone at the facility.",
  ]);
  expect(result.assessment?.facts).toEqual(captured.response.assessment.facts);
  expect(result.assessment?.indicators).toEqual(
    captured.response.assessment.indicators,
  );
  expect(validateCoordinatorResponse(result, captured.sources, false)).toEqual(
    result,
  );
});

it("deduplicates cosmetic differences and uncertainty wrappers without requiring indicators", () => {
  const result = parse(
    response([
      " Exact location: UNKNOWN. ",
      "exact   location",
      "The caller's current safety is unknown.",
      "The caller’s current safety",
      "Whether the suspect entered the facility is reported as unknown.",
      "It is unknown whether the suspect entered the facility.",
    ]),
  );
  expect(result.assessment?.unknowns).toEqual([
    "Exact location: UNKNOWN.",
    "The caller's current safety is unknown.",
    "Whether the suspect entered the facility is reported as unknown.",
  ]);
});

it("retains different people, places, qualifiers and observation scopes", () => {
  const gaps = [
    "Whether the caller is safe",
    "Whether other personnel are safe",
    "Suspect location",
    "Victim location",
    "Whether any injuries are present",
    "Whether any serious injuries are present",
    "Whether the victim is breathing",
    "Whether breathing has been observed",
    "Personnel safety is not unknown",
    "If personnel safety is unknown",
    "Is personnel safety unknown?",
  ];
  expect(parse(response(gaps)).assessment?.unknowns).toEqual(gaps);
});

it("keeps a matched Unknown answer instead of a duplicate free-form gap even without indicators", () => {
  const value = response(["Whether the caller is safe"]);
  value.assessment!.facts = [
    {
      text: "It is unknown whether the caller is safe.",
      source: { source: "officer", messageId: id, quote: "Unknown" },
      evidenceStatus: "unverified",
    },
  ];
  const result = parse(value, { [id]: "Unknown" });
  expect(result.assessment?.unknowns).toEqual([
    "It is unknown whether the caller is safe.",
  ]);
  expect(result.assessment?.facts[0].evidenceStatus).toBe("matched");
  expect(parse(value).assessment?.unknowns).toEqual([
    "Whether the caller is safe",
  ]);
});

it("normalizes repeated indicator labels and clears stale labels without removing scoped details", () => {
  const value = response([
    " injuries reported: UNKNOWN. ",
    "Injuries reported",
    "Current immediate danger status",
    "Whether the caller's injury is serious",
  ]);
  value.assessment!.indicators = {
    emergency: { status: "no", reason: "Urgent assistance not required." },
    police: { status: "no", reason: "Police support not required." },
    medical: { status: "yes", reason: "Medical support reported needed." },
    ambulance: { status: "no", reason: "Ambulance not required." },
    fire: { status: "no", reason: "Fire response not required." },
    weapon: { status: "no", reason: "No weapon reported." },
    injuries: { status: "unknown", reason: "Reported injuries unknown." },
    immediateDanger: { status: "unknown", reason: "Current danger unknown." },
  };
  expect(parse(value).assessment?.unknowns).toEqual([
    "Injuries reported: Unknown",
    "Current immediate danger: Unknown",
    "Whether the caller's injury is serious",
  ]);
  value.assessment!.indicators.injuries.status = "yes";
  expect(parse(value).assessment?.unknowns).toEqual([
    "Current immediate danger: Unknown",
    "Whether the caller's injury is serious",
  ]);
});

it("deduplicates before counting the ledger limit instead of rejecting repeated gaps as overflow", () => {
  const value = response(Array(20).fill("Exact location"));
  expect(parse(value).assessment?.unknowns).toEqual(["Exact location"]);
});
