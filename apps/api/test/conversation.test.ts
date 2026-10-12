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
it("persists bounded intake and allows a manual finish without reopening on updates", async () => {
  const s = await setup();
  let snapshot = await s.service.get(s.session, s.incident.id);
  for (let n = 0; n < 6; n++)
    snapshot = await s.service.run(
      s.session,
      s.incident.id,
      {
        turnId: randomUUID(),
        expectedRevision: snapshot.incident.revision,
        kind: n ? "message" : "initial",
        ...(n ? { text: "Unknown" } : {}),
      },
      async () => {},
    );
  expect(snapshot.incident.intakeState).toBe("ready");
  expect(snapshot.turns.filter((t) => t.question)).toHaveLength(5);
  snapshot = await s.service.run(
    s.session,
    s.incident.id,
    {
      turnId: randomUUID(),
      expectedRevision: snapshot.incident.revision,
      kind: "message",
      text: "A voluntary update",
    },
    async () => {},
  );
  expect(snapshot.turns.at(-1)?.question).toBeNull();
  const other = await s.intake.create(s.session, {
    reportText: "Another fictional report",
  });
  const opened = await s.service.run(
    s.session,
    other.id,
    { turnId: randomUUID(), expectedRevision: 1, kind: "initial" },
    async () => {},
  );
  const done = await s.service.run(
    s.session,
    other.id,
    {
      turnId: randomUUID(),
      expectedRevision: opened.incident.revision,
      kind: "finish",
    },
    async () => {},
  );
  expect(done.incident.intakeState).toBe("ready");
  expect(done.turns.at(-1)?.question).toBeNull();
});
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
it("retains a safe failed attempt after retry succeeds", async () => {
  const s = await setup();
  const tid = randomUUID();
  let attempt = 0;
  const service = new ConversationService({
    ...s,
    provider: {
      async *generate() {
        if (attempt++ === 0)
          throw new SyntaxError("private malformed response contents");
        yield { type: "result" as const, response: result };
      },
    },
  });
  const events: any[] = [];
  const failed = await service.run(
    s.session,
    s.incident.id,
    { turnId: tid, expectedRevision: 1, kind: "initial" },
    async (event) => {
      events.push(event);
    },
  );
  expect(failed.turns[0].failureCode).toBe("INVALID_RESPONSE");
  expect(events.at(-1).message).toMatch(/format|incomplete/i);
  const completed = await service.retry(
    s.session,
    s.incident.id,
    tid,
    { attemptId: randomUUID(), expectedRevision: failed.incident.revision },
    async () => {},
  );
  expect(completed.turns[0].state).toBe("completed");
  expect(completed.turns[0].failureCode).toBeUndefined();
  const history = (completed.turns[0] as any).attemptHistory;
  expect(history).toHaveLength(2);
  expect(history[0]).toMatchObject({
    attempt: 1,
    state: "failed",
    failureCode: "INVALID_RESPONSE",
  });
  expect(history[1]).toMatchObject({ attempt: 2, state: "completed" });
  expect(history[0].durationMs).toBeGreaterThanOrEqual(0);
  expect(JSON.stringify(history)).not.toContain("private malformed");
});
it.each(["legacy failure", "expired lease"])(
  "preserves %s when retry completes",
  async (kind) => {
    const s = await setup();
    const tid = randomUUID();
    await s.service.run(
      s.session,
      s.incident.id,
      { turnId: tid, expectedRevision: 1, kind: "initial" },
      async () => {},
    );
    const stored = s.docs[`turn:${s.incident.id}:${tid}`];
    delete stored.turn.attemptHistory;
    delete stored.turn.reply;
    stored.turn.state = kind === "expired lease" ? "processing" : "failed";
    stored.turn.failureCode = "INVALID_RESPONSE";
    if (kind === "expired lease") {
      const lease = { token: "expired", until: Date.now() - 1 };
      s.docs[`incident:${s.incident.id}`].activeTurnId = tid;
      s.docs[`incident:${s.incident.id}`].lease = lease;
      s.docs["session:alice"].activeLease = lease;
    }
    const current = await s.service.get(s.session, s.incident.id);
    const completed = await s.service.retry(
      s.session,
      s.incident.id,
      tid,
      { attemptId: randomUUID(), expectedRevision: current.incident.revision },
      async () => {},
    );
    expect(completed.turns[0].attemptHistory).toHaveLength(2);
    expect(completed.turns[0].attemptHistory![0]).toMatchObject({
      attempt: 1,
      state: kind === "expired lease" ? "interrupted" : "failed",
      failureCode:
        kind === "expired lease"
          ? "CONVERSATION_INTERRUPTED"
          : "INVALID_RESPONSE",
    });
    expect(completed.turns[0].attemptHistory![1].state).toBe("completed");
    if (kind === "legacy failure") {
      expect(completed.turns[0].attemptHistory![0].startedAt).toBeUndefined();
      expect(completed.turns[0].attemptHistory![0].durationMs).toBeUndefined();
    }
  },
);
it("allows a live draft plus review to finish within their shared bounded deadline", async () => {
  const s = await setup();
  const started = Date.now();
  const service = new ConversationService({
    ...s,
    config: { ...s.config, mode: "live", analysisTimeout: 100 },
    provider: {
      async *generate() {
        expect(
          s.docs["session:alice"].activeLease.until,
        ).toBeGreaterThanOrEqual(started + 5200);
        await new Promise((resolve) => setTimeout(resolve, 150));
        yield { type: "result" as const, response: result };
      },
    },
  });
  const snapshot = await service.run(
    s.session,
    s.incident.id,
    { turnId: randomUUID(), expectedRevision: 1, kind: "initial" },
    async () => {},
  );
  expect(snapshot.turns[0].state).toBe("completed");
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
it("keeps an urgent assessment and its essential question, but manual completion discards further questions", async () => {
  const s = await setup();
  const events: any[] = [];
  const service = new ConversationService({
    ...s,
    provider: {
      async *generate() {
        yield { type: "delta" as const, text: result.reply };
        yield {
          type: "result" as const,
          response: {
            ...result,
            assessment: { ...result.assessment, urgency: "urgent_review" },
          },
        };
      },
    },
  });
  const snap = await service.run(
    s.session,
    s.incident.id,
    { turnId: randomUUID(), expectedRevision: 1, kind: "initial" },
    async (e) => {
      events.push(e);
    },
  );
  expect(
    events
      .filter((e) => e.type === "delta")
      .map((e) => e.text)
      .join(""),
  ).toBe(snap.turns[0].reply);
  expect(snap.turns[0].question).toBe("Which entrance?");
  expect(snap.incident.intakeState).toBe("clarifying");
  expect(snap.incident.assessment?.urgency).toBe("urgent_review");
  const finished = await service.run(
    s.session,
    s.incident.id,
    {
      turnId: randomUUID(),
      expectedRevision: snap.incident.revision,
      kind: "finish",
    },
    async () => {},
  );
  expect(finished.turns.at(-1)?.question).toBeNull();
  expect(finished.turns.at(-1)?.reply).not.toContain("Which entrance?");
});
it("rejects retry of a failed turn superseded by a later message", async () => {
  const s = await setup();
  const service = new ConversationService({
    ...s,
    provider: {
      async *generate(input) {
        if (input.turns.at(-1)?.officerText === "Unknown")
          throw Error("provider failed");
        yield { type: "result" as const, response: result };
      },
    },
  });
  let snap = await service.run(
    s.session,
    s.incident.id,
    { turnId: randomUUID(), expectedRevision: 1, kind: "initial" },
    async () => {},
  );
  const failedId = randomUUID();
  snap = await service.run(
    s.session,
    s.incident.id,
    {
      turnId: failedId,
      expectedRevision: snap.incident.revision,
      kind: "message",
      text: "Unknown",
    },
    async () => {},
  );
  snap = await service.run(
    s.session,
    s.incident.id,
    {
      turnId: randomUUID(),
      expectedRevision: snap.incident.revision,
      kind: "message",
      text: "University campus, beside the library",
    },
    async () => {},
  );
  await expect(
    service.retry(
      s.session,
      s.incident.id,
      failedId,
      { attemptId: randomUUID(), expectedRevision: snap.incident.revision },
      async () => {},
    ),
  ).rejects.toMatchObject({ status: 409, code: "TURN_SUPERSEDED" });
});
it("propagates disconnect to an idle provider and releases its lease as interrupted", async () => {
  const s = await setup();
  const controller = new AbortController();
  let entered!: () => void;
  const started = new Promise<void>((r) => (entered = r));
  let aborted = false;
  const service = new ConversationService({
    ...s,
    provider: {
      async *generate(input) {
        input.signal.addEventListener("abort", () => (aborted = true));
        entered();
        await new Promise(() => {});
        yield { type: "result" as const, response: result };
      },
    },
  });
  const work = (service as any).run(
    s.session,
    s.incident.id,
    { turnId: randomUUID(), expectedRevision: 1, kind: "initial" },
    async () => {},
    controller.signal,
  );
  await started;
  controller.abort();
  const snap = await work;
  expect(aborted).toBe(true);
  expect(snap.turns[0].state).toBe("interrupted");
  expect(snap.turns[0].failureCode).toBe("CONVERSATION_INTERRUPTED");
  expect(s.docs["session:alice"].activeLease).toBeUndefined();
});
