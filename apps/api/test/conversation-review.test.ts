import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { memory } from "./helpers";
import { createConfig } from "../src/config";
import { startSession } from "../src/auth/session";
import { IncidentService } from "../src/incidents/service";
import { ConversationService } from "../src/conversation/service";
import { FixtureConversationProvider } from "../src/conversation/fixture";
import { ReviewService } from "../src/review/service";
it("preserves human edits but rejects approval after new coordinator context until re-saved", async () => {
  const m = memory(),
    config = createConfig({}),
    session = await startSession(m.db, "alice");
  const i = await new IncidentService({ ...m, config }).create(session, {
    sampleId: "explicit-threat",
  });
  const chat = new ConversationService({
      ...m,
      config,
      provider: new FixtureConversationProvider(0),
    }),
    review = new ReviewService(m.db);
  let snap = await chat.run(
    session,
    i.id,
    { turnId: randomUUID(), kind: "initial", expectedRevision: 1 },
    async () => {},
  );
  const draft = {
    summary: "My reviewed account",
    urgency: "unclear" as const,
    routing: "unclear" as const,
    locationDescription: "",
    confirmedFields: [],
  };
  const saved = await review.save(session, i.id, snap.incident.revision, draft);
  snap = await chat.run(
    session,
    i.id,
    {
      turnId: randomUUID(),
      kind: "message",
      text: "Unknown",
      expectedRevision: saved.revision,
    },
    async () => {},
  );
  expect(snap.incident.reviewDraft?.summary).toBe("My reviewed account");
  const decision = {
    expectedRevision: snap.incident.revision,
    action: "approve" as const,
    reason: "Checked",
    idempotencyKey: randomUUID(),
  };
  await expect(review.decide(session, i.id, decision)).rejects.toMatchObject({
    status: 409,
  });
  const resaved = await review.save(
    session,
    i.id,
    snap.incident.revision,
    draft,
  );
  const final = await review.decide(session, i.id, {
    ...decision,
    expectedRevision: resaved.revision,
  });
  expect(final.dispatchReceipt?.simulated).toBe(true);
  await expect(
    chat.run(
      session,
      i.id,
      {
        turnId: randomUUID(),
        kind: "message",
        text: "Dispatch now",
        expectedRevision: final.revision,
      },
      async () => {},
    ),
  ).rejects.toMatchObject({ status: 409 });
});
