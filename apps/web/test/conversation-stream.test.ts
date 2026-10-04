import { it, expect } from "vitest";
import { readEvents } from "../src/features/conversation/stream";
function stream(parts: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(c) {
      parts.forEach((p) => c.enqueue(p));
      c.close();
    },
  });
}
it("handles split UTF-8 and multiple frames without duplicate output", async () => {
  const text =
    [
      { turnId: "a", sequence: 1, type: "delta", text: "café 🚨" },
      { turnId: "a", sequence: 1, type: "delta", text: "duplicate" },
      { turnId: "a", sequence: 2, type: "completed", snapshot: {} },
    ]
      .map((v) => JSON.stringify(v))
      .join("\n") + "\n";
  const bytes = new TextEncoder().encode(text),
    events: any[] = [];
  await readEvents(stream([...bytes].map((b) => new Uint8Array([b]))), (e) =>
    events.push(e),
  );
  expect(events.map((e) => e.type)).toEqual(["delta", "completed"]);
  expect(events[0].text).toBe("café 🚨");
});
it("rejects EOF before completion and explicit failure", async () => {
  for (const event of [
    { turnId: "a", sequence: 1, type: "delta", text: "partial" },
    {
      turnId: "a",
      sequence: 1,
      type: "failure",
      code: "FAILED",
      message: "Interrupted",
    },
  ])
    await expect(
      readEvents(
        stream([new TextEncoder().encode(JSON.stringify(event) + "\n")]),
        () => {},
      ),
    ).rejects.toThrow();
});
