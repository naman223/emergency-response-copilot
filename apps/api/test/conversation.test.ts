import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { memory } from "./helpers";
import { createConfig } from "../src/config";
import { startSession } from "../src/auth/session";
import { IncidentService } from "../src/incidents/service";
import { ConversationService } from "../src/conversation/service";
import { resetSession } from "../src/demo/cleanup";
const result = {
  reply: "Received. Which entrance?",
  question: "Which entrance?",
  suggestedReplies: ["Unknown"],
  assessment: {
    summary: "Officer reports a concern.",
    facts: [],
    unknowns: ["Location"],
    urgency: "unclear",
    routing: "unclear",
    locationDescription: "",
  },
};
async function setup() {
  const m = memory(),
    config = { ...createConfig({}), analysisTimeout: 200 };
  const session = await startSession(m.db, "alice");
  const intake = new IncidentService({ ...m, config });
  const incident = await intake.create(session, {
    reportText: "There is someone outside.",
  });
  let calls = 0;
  const provider = {
    async *generate() {
      calls++;
      yield { type: "delta" as const, text: result.reply };
      yield { type: "result" as const, response: result };
    },
  };
  const service = new ConversationService({ ...m, config, provider });
  return {
    ...m,
    config,
    session,
    incident,
    intake,
    service,
    provider,
    calls: () => calls,
  };
}
it("persists text intake and deduplicates completed turns", async () => {
  const s = await setup();
  const req = {
    turnId: randomUUID(),
    expectedRevision: 1,
    kind: "initial" as const,
  };
  await s.service.run(s.session, s.incident.id, req, async () => {});
  const a = await s.service.run(s.session, s.incident.id, req, async () => {});
  expect(a.turns).toHaveLength(1);
  expect(a.turns[0].reply).toContain("Received");
  expect(s.calls()).toBe(1);
  expect(s.blobs.size).toBe(0);
  await expect(
    s.service.run(
      s.session,
      s.incident.id,
      { ...req, kind: "message", text: "different" },
      async () => {},
    ),
  ).rejects.toMatchObject({ status: 409 });
});
it("isolates conversations and removes them on reset", async () => {
  const s = await setup();
  await s.service.run(
    s.session,
    s.incident.id,
    { turnId: randomUUID(), expectedRevision: 1, kind: "initial" },
    async () => {},
  );
  const other = await startSession(s.db, "bob");
  await expect(s.service.get(other, s.incident.id)).rejects.toMatchObject({
    status: 404,
  });
  await resetSession(s.db, s.audio, s.session.uid);
  expect(Object.keys(s.docs).filter((k) => k.startsWith("turn:"))).toEqual([]);
});
it("preserves input and bounds retries when provider fails", async () => {
  const s = await setup();
  const service = new ConversationService({
    ...s,
    provider: {
      async *generate() {
        throw Error("private provider message");
        yield { type: "delta" as const, text: "" };
      },
    },
  });
  const id = randomUUID();
  let snap = await service.run(
    s.session,
    s.incident.id,
    { turnId: id, expectedRevision: 1, kind: "initial" },
    async () => {},
  );
  for (let n = 0; n < 2; n++)
    snap = await service.retry(
      s.session,
      s.incident.id,
      id,
      { attemptId: randomUUID(), expectedRevision: snap.incident.revision },
      async () => {},
    );
  expect(snap.turns[0].state).toBe("failed");
  expect(snap.turns[0].officerText).toBe("There is someone outside.");
  await expect(
    service.retry(
      s.session,
      s.incident.id,
      id,
      { attemptId: randomUUID(), expectedRevision: snap.incident.revision },
      async () => {},
    ),
  ).rejects.toMatchObject({ status: 429 });
});
it("serializes simultaneous calls and preserves completed state when delivery fails", async () => {
  const s = await setup();
  const req = {
    turnId: randomUUID(),
    expectedRevision: 1,
    kind: "initial" as const,
  };
  const replies = await Promise.allSettled([
    s.service.run(s.session, s.incident.id, req, async () => {}),
    s.service.run(s.session, s.incident.id, req, async () => {}),
  ]);
  expect(s.calls()).toBe(1);
  expect(
    replies.filter((x) => x.status === "fulfilled").length,
  ).toBeGreaterThan(0);
  const current = await s.service.get(s.session, s.incident.id);
  await s.service
    .run(
      s.session,
      s.incident.id,
      {
        turnId: randomUUID(),
        expectedRevision: current.incident.revision,
        kind: "message",
        text: "Unknown",
      },
      async (e) => {
        if (e.type === "completed") throw Error("disconnected");
      },
    )
    .catch(() => {});
  expect(
    (await s.service.get(s.session, s.incident.id)).turns.at(-1)?.state,
  ).toBe("completed");
});
it("reserves the last global quota slot atomically across sessions", async () => {
  const s = await setup();
  const bob = await startSession(s.db, "bob");
  const i = await s.intake.create(bob, { reportText: "Another report" });
  s.docs["quota:global"] = {
    hour: Math.floor(Date.now() / 3600000),
    count: 99,
  };
  const responses = await Promise.allSettled([
    s.service.run(
      s.session,
      s.incident.id,
      { turnId: randomUUID(), expectedRevision: 1, kind: "initial" },
      async () => {},
    ),
    s.service.run(
      bob,
      i.id,
      { turnId: randomUUID(), expectedRevision: 1, kind: "initial" },
      async () => {},
    ),
  ]);
  expect(responses.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(s.docs["quota:global"].count).toBe(100);
  expect(s.calls()).toBe(1);
});
it("bounds conversations to twenty submitted turns", async () => {
  const s = await setup();
  let revision = 1;
  for (let n = 0; n < 20; n++) {
    const snap = await s.service.run(
      s.session,
      s.incident.id,
      {
        turnId: randomUUID(),
        expectedRevision: revision,
        kind: n ? "message" : "initial",
        ...(n ? { text: "Unknown" } : {}),
      },
      async () => {},
    );
    revision = snap.incident.revision;
  }
  await expect(
    s.service.run(
      s.session,
      s.incident.id,
      {
        turnId: randomUUID(),
        expectedRevision: revision,
        kind: "message",
        text: "one too many",
      },
      async () => {},
    ),
  ).rejects.toMatchObject({ status: 429 });
  expect(s.calls()).toBe(20);
});
it("recovers an expired third-attempt lease without clearing a newer session lease", async () => {
  const s = await setup();
  const tid = randomUUID();
  await s.service.run(
    s.session,
    s.incident.id,
    { turnId: tid, expectedRevision: 1, kind: "initial" },
    async () => {},
  );
  const r = s.docs[`incident:${s.incident.id}`];
  r.activeTurnId = tid;
  r.lease = { token: "expired", until: Date.now() - 1 };
  r.incident.analysisState = "processing";
  const stored = s.docs[`turn:${s.incident.id}:${tid}`];
  stored.turn.state = "processing";
  stored.turn.attempts = 3;
  s.docs["session:alice"].activeLease = {
    token: "newer",
    until: Date.now() + 1000,
  };
  const snap = await s.service.get(s.session, s.incident.id);
  expect(snap.turns[0].state).toBe("interrupted");
  expect(snap.incident.analysisState).toBe("failed");
  expect(s.docs["session:alice"].activeLease.token).toBe("newer");
});
it("times out an unresponsive provider and permits manual review", async () => {
  const s = await setup();
  const service = new ConversationService({
    ...s,
    config: { ...s.config, analysisTimeout: 15 },
    provider: {
      async *generate() {
        await new Promise(() => {});
        yield { type: "delta" as const, text: "" };
      },
    },
  });
  const snap = await service.run(
    s.session,
    s.incident.id,
    { turnId: randomUUID(), expectedRevision: 1, kind: "initial" },
    async () => {},
  );
  expect(snap.turns[0].failureCode).toBe("CONVERSATION_TIMEOUT");
  expect(s.docs["session:alice"].activeLease).toBeUndefined();
});
it("reset during generation prevents deleted conversations from being resurrected", async () => {
  const s = await setup();
  const service = new ConversationService({
    ...s,
    provider: {
      async *generate() {
        await resetSession(s.db, s.audio, s.session.uid);
        yield { type: "result" as const, response: result };
      },
    },
  });
  await expect(
    service.run(
      s.session,
      s.incident.id,
      { turnId: randomUUID(), expectedRevision: 1, kind: "initial" },
      async () => {},
    ),
  ).rejects.toMatchObject({ status: 401 });
  expect(
    Object.keys(s.docs).filter(
      (k) => k.startsWith("turn:") || k.startsWith("incident:"),
    ),
  ).toEqual([]);
});
it("coalesces rapid provider deltas into bounded delivery batches", async () => {
  const s = await setup();
  const reply = "A reported detail. ".repeat(30).trim();
  const service = new ConversationService({
    ...s,
    provider: {
      async *generate() {
        for (const text of reply) yield { type: "delta" as const, text };
        yield {
          type: "result" as const,
          response: { ...result, reply: reply.trim() },
        };
      },
    },
  });
  const events: any[] = [];
  await service.run(
    s.session,
    s.incident.id,
    { turnId: randomUUID(), expectedRevision: 1, kind: "initial" },
    async (e) => {
      events.push(e);
    },
  );
  expect(events.filter((e) => e.type === "delta").length).toBeLessThan(10);
});
