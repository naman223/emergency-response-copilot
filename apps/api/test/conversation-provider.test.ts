import { it, expect } from "vitest";
import { FixtureConversationProvider } from "../src/conversation/fixture";
import { ReplyDecoder } from "../src/conversation/reply-decoder";
const id = "11111111-1111-4111-8111-111111111111";
const turn = (text: string, kind: "initial" | "message" = "message") => ({
  id,
  incidentId: id,
  kind,
  officerText: text,
  state: "completed" as const,
  attempts: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
async function generate(
  turns: any[],
  assessment?: any,
  sampleId = "explicit-threat",
) {
  let result: any;
  let text = "";
  for await (const c of new FixtureConversationProvider(0).generate({
    sampleId,
    report: {},
    turns,
    assessment,
    signal: new AbortController().signal,
  })) {
    if (c.type === "result") result = c.response;
    else text += c.text;
  }
  expect(text).toBe(result.reply);
  return result;
}
it("asks targeted questions, retains unknowns and supports corrections", async () => {
  const first = await generate([turn("", "initial")]);
  expect(first.reply).toContain("knife");
  expect(first.question).toContain("site");
  const site = await generate(
    [turn("", "initial"), turn("University campus, beside the library")],
    first.assessment,
  );
  expect(site.assessment.locationDescription).toContain("University campus");
  expect(site.question).toContain("injur");
  const unknown = await generate(
    [
      turn("", "initial"),
      turn("University campus, beside the library"),
      turn("Unknown"),
    ],
    site.assessment,
  );
  expect(unknown.assessment.unknowns).toContain("Injury status unknown");
  const corrected = await generate(
    [
      turn("", "initial"),
      turn("Correction: the south gate, beside the library"),
    ],
    site.assessment,
  );
  expect(corrected.assessment.locationDescription).toContain("south gate");
});
it("does not pretend to interpret unsupported local messages", async () => {
  const r = await generate([
    turn("", "initial"),
    turn("What is the capital of Peru?"),
  ]);
  expect(r.assessment).toBeNull();
  expect(r.reply).toContain("scripted");
});
it("provides a meaningful opening for all five samples", async () => {
  for (const id of [
    "explicit-threat",
    "calm-danger",
    "benign-mention",
    "ambiguous",
    "missing-location",
  ]) {
    const r = await generate([turn("", "initial")], undefined, id);
    expect(r.reply.length).toBeGreaterThan(100);
    expect(r.question).toBeTruthy();
  }
});
it("decodes escaped unicode strings across every character boundary without exposing JSON", () => {
  const decoder = new ReplyDecoder();
  const source = JSON.stringify({
    assessment: { reply: "not this" },
    reply: 'He said "help". café 🚨\\',
    question: null,
  });
  let out = "";
  for (const c of source) out += decoder.push(c);
  expect(out).toBe('He said "help". café 🚨\\');
  expect((decoder.finish() as any).reply).toBe(out);
});
it("rejects duplicate reply fields, oversized and truncated JSON", () => {
  for (const input of [
    '{"reply":"a","reply":"b"}',
    '{"reply":"unfinished',
    "x".repeat(65537),
  ]) {
    const d = new ReplyDecoder();
    expect(() => {
      d.push(input);
      d.finish();
    }).toThrow();
  }
});
