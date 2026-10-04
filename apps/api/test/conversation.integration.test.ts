import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { buildApp } from "../src/app";
import { createFirebase } from "../src/infra/firebase";
import { createConfig } from "../src/config";
import { FixtureProvider } from "../src/analysis/fixture";
const config = createConfig({ ...process.env, ANALYSIS_MODE: "fixture" }),
  firebase = createFirebase(config);
let app: Awaited<ReturnType<typeof buildApp>>;
async function session() {
  const r = await fetch(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ returnSecureToken: true }),
    },
  );
  const b = (await r.json()) as any;
  const h = { authorization: `Bearer ${b.idToken}` };
  expect(
    (await app.inject({ method: "POST", url: "/api/session", headers: h }))
      .statusCode,
  ).toBe(200);
  return h;
}
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
it("streams a private sample conversation and saves officer clarification", async () => {
  const h = await session(),
    other = await session();
  const i = (
    await app.inject({
      method: "POST",
      url: "/api/incidents",
      headers: h,
      payload: { sampleId: "explicit-threat" },
    })
  ).json();
  const url = `/api/incidents/${i.id}`;
  expect((await app.inject({ url: url + "/conversation" })).statusCode).toBe(
    401,
  );
  expect(
    (await app.inject({ url: url + "/conversation", headers: other }))
      .statusCode,
  ).toBe(404);
  const request = {
    turnId: randomUUID(),
    expectedRevision: 1,
    kind: "initial",
  };
  const response = await app.inject({
    method: "POST",
    url: url + "/turns",
    headers: h,
    payload: request,
  });
  expect(response.statusCode).toBe(200);
  const events = response.body
    .trim()
    .split("\n")
    .map((v) => JSON.parse(v));
  expect(events[0].type).toBe("status");
  expect(events.some((e) => e.type === "delta")).toBe(true);
  expect(events.at(-1).type).toBe("completed");
  let snapshot = events.at(-1).snapshot;
  expect(snapshot.turns).toHaveLength(1);
  expect(snapshot.incident.dispatchReceipt).toBeUndefined();
  const answer = await app.inject({
    method: "POST",
    url: url + "/turns",
    headers: h,
    payload: {
      turnId: randomUUID(),
      expectedRevision: snapshot.incident.revision,
      kind: "message",
      text: "University campus, beside the library",
    },
  });
  snapshot = JSON.parse(answer.body.trim().split("\n").at(-1)!).snapshot;
  expect(snapshot.incident.assessment.locationDescription).toContain(
    "University campus",
  );
  expect(snapshot.turns).toHaveLength(2);
  expect(
    (
      await app.inject({
        method: "POST",
        url: url + "/turns",
        headers: other,
        payload: request,
      })
    ).statusCode,
  ).toBe(404);
  await app.inject({ method: "DELETE", url: "/api/session", headers: h });
  expect(
    (await app.inject({ url: url + "/conversation", headers: h })).statusCode,
  ).toBe(401);
  expect(
    await firebase.db.get(`turn:${i.id}:${request.turnId}`),
  ).toBeUndefined();
}, 30000);
it("applies the last global quota slot atomically in Firestore", async () => {
  const a = await session(),
    b = await session();
  const create = async (h: any) =>
    (
      await app.inject({
        method: "POST",
        url: "/api/incidents",
        headers: h,
        payload: { reportText: "Fictional quota-check report" },
      })
    ).json();
  const ia = await create(a),
    ib = await create(b);
  await firebase.db.transact(["quota:global"], () => ({
    result: null,
    put: {
      "quota:global": { hour: Math.floor(Date.now() / 3600000), count: 99 },
    },
  }));
  try {
    const results = await Promise.all(
      [
        [a, ia],
        [b, ib],
      ].map(([headers, i]) =>
        app.inject({
          method: "POST",
          url: `/api/incidents/${i.id}/turns`,
          headers,
          payload: {
            turnId: randomUUID(),
            expectedRevision: 1,
            kind: "initial",
          },
        }),
      ),
    );
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 429]);
    expect((await firebase.db.get<any>("quota:global")).count).toBe(100);
  } finally {
    await firebase.db.transact(["quota:global"], () => ({
      result: null,
      remove: ["quota:global"],
    }));
  }
}, 30000);
it("reset while a streamed response is pending prevents persistence after revocation", async () => {
  let started!: () => void, finish!: () => void;
  const entered = new Promise<void>((r) => (started = r)),
    release = new Promise<void>((r) => (finish = r));
  const controlled = await buildApp({
    config,
    ...firebase,
    provider: new FixtureProvider(),
    conversationProvider: {
      async *generate() {
        yield { type: "delta", text: "A provisional response" };
        started();
        await release;
        yield {
          type: "result",
          response: {
            reply: "A provisional response",
            question: null,
            suggestedReplies: [],
            assessment: null,
          },
        };
      },
    },
  });
  const h = await session();
  const i = (
    await controlled.inject({
      method: "POST",
      url: "/api/incidents",
      headers: h,
      payload: { reportText: "Fictional reset check" },
    })
  ).json();
  const tid = randomUUID();
  const request = controlled.inject({
    method: "POST",
    url: `/api/incidents/${i.id}/turns`,
    headers: h,
    payload: { turnId: tid, expectedRevision: 1, kind: "initial" },
  });
  const pending = request.then((r) => r);
  try {
    await entered;
    await controlled.inject({
      method: "DELETE",
      url: "/api/session",
      headers: h,
    });
    finish();
    await pending;
    expect(await firebase.db.get(`incident:${i.id}`)).toBeUndefined();
    expect(await firebase.db.get(`turn:${i.id}:${tid}`)).toBeUndefined();
    expect(
      (
        await controlled.inject({
          url: `/api/incidents/${i.id}/conversation`,
          headers: h,
        })
      ).statusCode,
    ).toBe(401);
  } finally {
    finish();
    await pending;
    await controlled.close();
  }
}, 30000);
