import type { ConversationEvent } from "@copilot/contracts";
import { ensureUser } from "../../firebase";
export async function readEvents(
  body: ReadableStream<Uint8Array>,
  onEvent: (e: ConversationEvent) => void,
) {
  const reader = body.getReader(),
    decoder = new TextDecoder();
  let buffer = "",
    finished = false;
  const seen = new Map<string, number>();
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      if (buffer.length > 2 * 1024 * 1024)
        throw Error("Response exceeded its limit.");
      let end;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        if (!line.trim()) continue;
        const e = JSON.parse(line) as ConversationEvent;
        if (typeof e.turnId !== "string" || !Number.isInteger(e.sequence))
          throw Error("Invalid conversation response.");
        if (e.sequence <= (seen.get(e.turnId) ?? 0)) continue;
        seen.set(e.turnId, e.sequence);
        if (e.type === "failure") throw Error(e.message);
        if (e.type === "completed") finished = true;
        onEvent(e);
      }
      if (done) break;
    }
    if (buffer.trim() || !finished)
      throw Error(
        "Response interrupted. Your message is saved; reload or retry.",
      );
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export async function streamConversation(
  path: string,
  body: unknown,
  onEvent: (e: ConversationEvent) => void,
  signal: AbortSignal,
) {
  const user = await ensureUser();
  const r = await fetch("/api" + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await user.getIdToken()}`,
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw Error(e.error?.message ?? "Conversation unavailable.");
  }
  if (!r.body) throw Error("Streaming unavailable.");
  await readEvents(r.body, onEvent);
}
