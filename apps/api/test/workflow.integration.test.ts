import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { buildApp } from "../src/app";
import { createFirebase } from "../src/infra/firebase";
import { createConfig } from "../src/config";
import { FixtureProvider } from "../src/analysis/fixture";
const config = createConfig({ ...process.env, ANALYSIS_MODE: "fixture" });
let app: Awaited<ReturnType<typeof buildApp>>;
const firebase = createFirebase(config);
async function user() {
  const r = await fetch(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ returnSecureToken: true }),
    },
  );
  const b = (await r.json()) as { idToken: string };
  return { authorization: `Bearer ${b.idToken}` };
}
async function session() {
  const h = await user();
  expect(
    (await app.inject({ method: "POST", url: "/api/session", headers: h }))
      .statusCode,
  ).toBe(200);
  return h;
}
async function incident(h: Record<string, string>) {
  const r = await app.inject({
    method: "POST",
    url: "/api/incidents",
    headers: h,
    payload: { sampleId: "explicit-threat" },
  });
  expect(r.statusCode).toBe(201);
  return r.json();
}
const draft = {
  summary: "Caller reports being followed and a knife.",
  urgency: "urgent_review",
  routing: "police",
  locationDescription: "North gate (unconfirmed)",
  confirmedFields: [],
};
beforeAll(async () => {
  app = await buildApp({
    config,
    ...firebase,
    provider: new FixtureProvider(),
  });
});
afterAll(async () => {
  await app?.close();
  await firebase.close();
});
describe("owned intake and human review", () => {
  it("rejects missing and malformed authentication", async () => {
    for (const headers of [{}, { authorization: "Bearer not-a-token" }])
      expect(
        (await app.inject({ url: "/api/incidents", headers })).statusCode,
      ).toBe(401);
  });
  it("keeps new incidents pending and isolates data, playback, history, edits and decisions", async () => {
    const a = await session(),
      b = await session(),
      i = await incident(a);
    expect(i.analysisState).toBe("pending");
    expect(i.dispatchReceipt).toBeUndefined();
    for (const [method, suffix, payload] of [
      ["GET", "", undefined],
      ["GET", "/audio", undefined],
      ["GET", "/history", undefined],
      ["PATCH", "/review", { expectedRevision: 1, draft }],
      [
        "POST",
        "/decision",
        {
          expectedRevision: 1,
          action: "approve",
          reason: "Checked",
          idempotencyKey: randomUUID(),
        },
      ],
    ] as const) {
      expect(
        (
          await app.inject({
            method,
            url: `/api/incidents/${i.id}${suffix}`,
            headers: b,
            payload,
          })
        ).statusCode,
      ).toBe(404);
    }
    expect(
      (await app.inject({ url: "/api/incidents", headers: b })).json(),
    ).toEqual([]);
  });
  it("returns private recording bytes to the owner only", async () => {
    const h = await session(),
      i = await incident(h);
    const r = await app.inject({
      url: `/api/incidents/${i.id}/audio`,
      headers: h,
    });
    expect(r.statusCode).toBe(200);
    expect(r.rawPayload.subarray(0, 4).toString()).toBe("RIFF");
    expect(r.headers["cache-control"]).toContain("no-store");
  });
  it("produces fixture evidence without dispatch and marks mode", async () => {
    const h = await session(),
      i = await incident(h);
    const r = await app.inject({
      method: "POST",
      url: `/api/incidents/${i.id}/analyze`,
      headers: h,
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      analysisMode: "fixture",
      analysisState: "ready",
      simulationState: "not_started",
    });
    expect(r.json().brief.facts[0].evidenceStatus).toBe("matched");
  });
  it("requires review, rejects stale edits, and makes concurrent approvals idempotent", async () => {
    const h = await session(),
      i = await incident(h),
      url = `/api/incidents/${i.id}`;
    const decision = {
      expectedRevision: i.revision,
      action: "approve",
      reason: "Reviewed audio",
      idempotencyKey: randomUUID(),
    };
    expect(
      (
        await app.inject({
          method: "POST",
          url: url + "/decision",
          headers: h,
          payload: decision,
        })
      ).statusCode,
    ).toBe(409);
    const edited = await app.inject({
      method: "PATCH",
      url: url + "/review",
      headers: h,
      payload: { expectedRevision: i.revision, draft },
    });
    expect(edited.statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: url + "/review",
          headers: h,
          payload: { expectedRevision: i.revision, draft },
        })
      ).statusCode,
    ).toBe(409);
    decision.expectedRevision = edited.json().revision;
    const results = await Promise.all(
      [1, 2].map(() =>
        app.inject({
          method: "POST",
          url: url + "/decision",
          headers: h,
          payload: decision,
        }),
      ),
    );
    expect(results.map((r) => r.statusCode)).toEqual([200, 200]);
    expect(results[0].json().dispatchReceipt.id).toBe(
      results[1].json().dispatchReceipt.id,
    );
    const history = (
      await app.inject({ url: url + "/history", headers: h })
    ).json();
    expect(history.filter((e: any) => e.action === "approve")).toHaveLength(1);
    expect(
      (
        await app.inject({
          method: "POST",
          url: url + "/decision",
          headers: h,
          payload: { ...decision, reason: "Different" },
        })
      ).statusCode,
    ).toBe(409);
  });
  it("retains a closed report and requires a nonempty reason", async () => {
    const h = await session(),
      i = await incident(h),
      url = `/api/incidents/${i.id}/decision`;
    const p = {
      expectedRevision: 1,
      action: "close",
      reason: " ",
      idempotencyKey: randomUUID(),
    };
    expect(
      (await app.inject({ method: "POST", url, headers: h, payload: p }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url,
          headers: h,
          payload: { ...p, reason: "Test completed" },
        })
      ).json().reviewState,
    ).toBe("closed");
    expect(
      (await app.inject({ url: `/api/incidents/${i.id}/audio`, headers: h }))
        .statusCode,
    ).toBe(200);
  });
  it("atomically saves and approves the submitted draft once under concurrent retries", async () => {
    const h = await session(),
      i = await incident(h),
      url = `/api/incidents/${i.id}`;
    const payload = {
      expectedRevision: i.revision,
      action: "approve",
      reason: "Current review verified",
      idempotencyKey: randomUUID(),
      draft: { ...draft, services: ["police", "medical"] },
    };
    const results = await Promise.all(
      [1, 2].map(() =>
        app.inject({
          method: "POST",
          url: url + "/decision",
          headers: h,
          payload,
        }),
      ),
    );
    expect(results.map((r) => r.statusCode)).toEqual([200, 200]);
    expect(results[0].json()).toEqual(results[1].json());
    expect(results[0].json().reviewDraft).toEqual(payload.draft);
    expect(results[0].json().dispatchReceipt.smsMessages).toHaveLength(2);
    const history = (
      await app.inject({ url: url + "/history", headers: h })
    ).json();
    expect(history.map((event: any) => event.action)).toEqual([
      "edit",
      "approve",
    ]);
    expect(history[0].revision).toBe(
      results[0].json().dispatchReceipt.approvedRevision,
    );
  });
  it("reset revokes access and can be repeated", async () => {
    const h = await session(),
      i = await incident(h);
    expect(
      (await app.inject({ method: "DELETE", url: "/api/session", headers: h }))
        .statusCode,
    ).toBe(204);
    expect(
      (await app.inject({ url: `/api/incidents/${i.id}`, headers: h }))
        .statusCode,
    ).toBe(401);
    expect(
      (await app.inject({ method: "DELETE", url: "/api/session", headers: h }))
        .statusCode,
    ).toBe(204);
    expect(
      (await app.inject({ method: "POST", url: "/api/session", headers: h }))
        .statusCode,
    ).toBe(401);
  });
});
