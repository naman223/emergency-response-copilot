import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { memory } from "./helpers";
import { createConfig } from "../src/config";
import { startSession } from "../src/auth/session";
import { IncidentService } from "../src/incidents/service";
import { ReviewService } from "../src/review/service";
import { incidentSchema, type ReviewDraft } from "@copilot/contracts";

it("sends only simulated messages after approval and keeps retries idempotent", async () => {
  const m = memory(),
    session = await startSession(m.db, "alice"),
    config = createConfig({});
  const incident = await new IncidentService({ ...m, config }).create(session, {
    sampleId: "explicit-threat",
  });
  const review = new ReviewService(m.db, "http://127.0.0.1:5173");
  const draft: ReviewDraft = {
    summary: "Fictional injured caller at east gate",
    urgency: "urgent_review",
    routing: "police",
    services: ["police", "medical", "emergency"],
    locationDescription: "East gate",
    confirmedFields: ["locationDescription"],
  };
  const saved = await review.save(
    session,
    incident.id,
    incident.revision,
    draft,
  );
  expect(saved.dispatchReceipt).toBeUndefined();
  expect(saved.reviewDraft?.routing).toBe("police");
  const decision = {
    expectedRevision: saved.revision,
    action: "approve" as const,
    reason: "Reviewed",
    idempotencyKey: randomUUID(),
  };
  const [first, retry] = await Promise.all([
    review.decide(session, incident.id, decision),
    review.decide(session, incident.id, decision),
  ]);
  expect(first.dispatchReceipt).toEqual(retry.dispatchReceipt);
  expect(first.dispatchReceipt?.smsMessages?.map((m) => m.service)).toEqual(
    draft.services,
  );
  expect(
    new Set(first.dispatchReceipt?.smsMessages?.map((m) => m.id)).size,
  ).toBe(3);
  expect(incidentSchema.safeParse(first).success).toBe(true);
  const outsider = await startSession(m.db, "bob");
  await expect(
    review.decide(outsider, incident.id, decision),
  ).rejects.toMatchObject({ status: 404 });
});

it("legacy known routing gets an SMS, while legacy unclear routing cannot approve", async () => {
  const m = memory(),
    session = await startSession(m.db, "alice"),
    config = createConfig({});
  const service = new IncidentService({ ...m, config }),
    review = new ReviewService(m.db);
  for (const routing of ["medical", "unclear"] as const) {
    const incident = await service.create(session, {
      sampleId: "explicit-threat",
    });
    const saved = await review.save(session, incident.id, incident.revision, {
      summary: "Legacy reviewed report",
      urgency: "unclear",
      routing,
      locationDescription: "",
      confirmedFields: [],
    });
    const decision = {
      expectedRevision: saved.revision,
      action: "approve" as const,
      reason: "Checked",
      idempotencyKey: randomUUID(),
    };
    if (routing === "unclear")
      await expect(
        review.decide(session, incident.id, decision),
      ).rejects.toMatchObject({ code: "SERVICES_REQUIRED" });
    else
      expect(
        (
          await review.decide(session, incident.id, decision)
        ).dispatchReceipt?.smsMessages?.map((m) => m.service),
      ).toEqual(["medical"]);
  }
});

it("rejects approval with explicitly empty selections", async () => {
  const m = memory(),
    session = await startSession(m.db, "alice"),
    config = createConfig({});
  const incident = await new IncidentService({ ...m, config }).create(session, {
    sampleId: "explicit-threat",
  });
  const review = new ReviewService(m.db);
  const saved = await review.save(session, incident.id, incident.revision, {
    summary: "Reviewed report",
    urgency: "unclear",
    routing: "unclear",
    services: [],
    locationDescription: "",
    confirmedFields: [],
  });
  await expect(
    review.decide(session, incident.id, {
      expectedRevision: saved.revision,
      action: "approve",
      reason: "Checked",
      idempotencyKey: randomUUID(),
    }),
  ).rejects.toMatchObject({ code: "SERVICES_REQUIRED" });
});
