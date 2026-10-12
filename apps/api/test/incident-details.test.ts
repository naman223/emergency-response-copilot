import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { memory } from "./helpers";
import { createConfig } from "../src/config";
import { startSession } from "../src/auth/session";
import { IncidentService } from "../src/incidents/service";
import { ConversationService } from "../src/conversation/service";
import { buildConversationContext } from "../src/conversation/context";
import { ReviewService } from "../src/review/service";

it("includes the original report, submitted location and every clarification in the incident", async () => {
  const m = memory(),
    config = createConfig({}),
    session = await startSession(m.db, "alice");
  const intake = new IncidentService({ ...m, config });
  const incident = await intake.create(session, {
    reportText: "Noise outside.",
    locationDescription: "Gate 3, Example Campus",
  });
  expect((incident as any).reportText).toBe("Noise outside.");
  let context = "",
    fail = false;
  const service = new ConversationService({
    ...m,
    config,
    provider: {
      async *generate(input) {
        context = buildConversationContext(input);
        if (fail) throw Error("provider unavailable");
        yield {
          type: "result",
          response: {
            reply: "Is anyone injured?",
            question: "Is anyone injured?",
            suggestedReplies: [],
            assessment: {
              summary: "Caller reports noise outside.",
              facts: [],
              unknowns: ["Injury status"],
              urgency: "unclear",
              routing: "unclear",
              locationDescription: "Gate 3, Example Campus",
            },
          },
        };
      },
    },
  });
  let snapshot = await service.run(
    session,
    incident.id,
    { turnId: randomUUID(), expectedRevision: 1, kind: "initial" },
    async () => {},
  );
  expect(JSON.parse(context).reportedLocation).toBe("Gate 3, Example Campus");
  const turnId = randomUUID();
  const request = {
    turnId,
    expectedRevision: snapshot.incident.revision,
    kind: "message" as const,
    text: "No injuries reported.",
  };
  let persistedDuringProcessing: unknown;
  snapshot = await service.run(session, incident.id, request, async (event) => {
    if (event.type === "status" && event.stage === "receiving_report")
      persistedDuringProcessing = (await intake.record(session, incident.id))
        .incident.clarifications;
  });
  expect(persistedDuringProcessing).toEqual([
    expect.objectContaining({
      turnId,
      answer: "No injuries reported.",
      assessmentState: "unassessed",
    }),
  ]);
  await service.run(session, incident.id, request, async () => {});
  expect(
    ((await intake.get(session, incident.id)) as any).clarifications,
  ).toEqual([
    expect.objectContaining({
      turnId,
      question: "Is anyone injured?",
      answer: "No injuries reported.",
      assessmentState: "included",
    }),
  ]);
  const reviewed = await new ReviewService(m.db).save(
    session,
    incident.id,
    snapshot.incident.revision,
    {
      summary: "Available report reviewed.",
      urgency: "unclear",
      routing: "unclear",
      locationDescription: "Gate 3",
      confirmedFields: [],
    },
  );
  fail = true;
  snapshot = await service.run(
    session,
    incident.id,
    {
      turnId: randomUUID(),
      expectedRevision: reviewed.revision,
      kind: "message",
      text: "Correction: one person fell.",
    },
    async () => {},
  );
  expect((snapshot.incident as any).clarifications).toHaveLength(2);
  expect((snapshot.incident as any).clarifications[1]).toMatchObject({
    answer: "Correction: one person fell.",
    assessmentState: "unassessed",
  });
  await expect(
    new ReviewService(m.db).decide(session, incident.id, {
      expectedRevision: snapshot.incident.revision,
      action: "approve",
      reason: "Review checked",
      idempotencyKey: randomUUID(),
    }),
  ).rejects.toMatchObject({ code: "REVIEW_STALE" });
});
