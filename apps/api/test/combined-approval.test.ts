import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { decisionSchema, type ReviewDraft } from "@copilot/contracts";
import { memory } from "./helpers";
import { createConfig } from "../src/config";
import { startSession } from "../src/auth/session";
import { IncidentService, incidentKey } from "../src/incidents/service";
import { ReviewService } from "../src/review/service";

const draft: ReviewDraft = {
  summary: "Reviewed injury at the east gate",
  urgency: "urgent_review",
  routing: "police",
  services: ["police", "medical"],
  locationDescription: "East gate",
  confirmedFields: [],
};
async function setup() {
  const m = memory(),
    session = await startSession(m.db, "reviewer"),
    config = createConfig({});
  const i = await new IncidentService({ ...m, config }).create(session, {
    sampleId: "explicit-threat",
  });
  const service = new ReviewService(m.db);
  const request = {
    expectedRevision: i.revision,
    action: "approve" as const,
    reason: "Reviewed current details",
    idempotencyKey: randomUUID(),
    draft,
  };
  return { ...m, session, i, service, request };
}

it("saves the current review and dispatches it atomically with idempotent retries", async () => {
  const { db, session, i, service, request } = await setup();
  const [first, retry] = await Promise.all([
    service.decide(session, i.id, request),
    service.decide(session, i.id, request),
  ]);
  expect(first).toEqual(retry);
  expect(first.reviewDraft).toEqual(draft);
  expect(first.reviewState).toBe("approved");
  expect(first.dispatchReceipt?.approvedRevision).toBe(i.revision + 1);
  expect(first.revision).toBe(i.revision + 2);
  expect(first.dispatchReceipt?.smsMessages?.map((m) => m.service)).toEqual([
    "police",
    "medical",
  ]);
  expect(first.dispatchReceipt?.smsMessages?.[1].body).toContain(draft.summary);
  const record = (await db.get(incidentKey(i.id))) as any;
  expect(record.history.map((event: any) => event.action)).toEqual([
    "edit",
    "approve",
  ]);
  expect(record.history[0].draft).toEqual(draft);
});

it("leaves the incident untouched when the submitted review cannot be approved", async () => {
  const { db, session, i, service, request } = await setup();
  for (const [patch, code] of [
    [{ ...draft, services: [] }, "SERVICES_REQUIRED"],
    [{ ...draft, destinationName: "Example station" }, "LOCATION_UNCONFIRMED"],
  ] as Array<[ReviewDraft, string]>) {
    await expect(
      service.decide(session, i.id, { ...request, draft: patch }),
    ).rejects.toMatchObject({ code });
    expect(((await db.get(incidentKey(i.id))) as any).incident).toEqual(i);
  }
});

it("does not overwrite another review when approving an outdated revision", async () => {
  const { db, session, i, service, request } = await setup();
  const current = await service.save(session, i.id, i.revision, {
    ...draft,
    summary: "Newer human details",
  });
  await expect(service.decide(session, i.id, request)).rejects.toMatchObject({
    code: "REVISION_CONFLICT",
  });
  expect(((await db.get(incidentKey(i.id))) as any).incident).toEqual(current);
});

it("accepts a review draft only with an approval decision", async () => {
  const { request } = await setup();
  expect(decisionSchema.safeParse(request).success).toBe(true);
  expect(
    decisionSchema.safeParse({ ...request, action: "close" }).success,
  ).toBe(false);
});
