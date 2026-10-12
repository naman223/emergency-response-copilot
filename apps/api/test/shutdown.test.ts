import { randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";
import type { IncomingMessage } from "node:http";
import { expect, it } from "vitest";
import { buildApp } from "../src/app";
import { createConfig } from "../src/config";
import { FixtureProvider } from "../src/analysis/fixture";
import { memory } from "./helpers";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

it.each([
  ["/api/report-preview", false],
  ["/api/incidents", false],
  ["/api/report-preview", true],
  ["/api/incidents", true],
] as const)(
  "shutdown interrupts an unfinished multipart upload to %s, pending authentication: %s",
  async (url, holdAuthentication) => {
    const m = memory();
    const authentication = deferred();
    let raw: IncomingMessage | undefined;
    let authenticated = 0,
      closed = false;
    const app = await buildApp({
      ...m,
      config: createConfig({}),
      provider: new FixtureProvider(),
      verifyToken: async () => {
        authenticated++;
        if (authenticated === 2 && holdAuthentication)
          await authentication.promise;
        return "upload-shutdown";
      },
    });
    app.addHook("preHandler", async (request) => {
      if (request.isMultipart()) raw = request.raw;
    });
    app.addHook("onClose", async () => {
      closed = true;
    });
    const headers = { authorization: "Bearer local-test" };
    await app.inject({ method: "POST", url: "/api/session", headers });
    const body = new PassThrough();
    body.write(
      '--upload\r\nContent-Disposition: form-data; name="audio"; filename="partial.wav"\r\nContent-Type: audio/wav\r\n\r\nRIFF',
    );
    const pending = Promise.resolve(
      app.inject({
        method: "POST",
        url,
        headers: {
          ...headers,
          "content-type": "multipart/form-data; boundary=upload",
        },
        payload: body,
      }),
    ).catch((error: unknown) => error);
    let closing: Promise<void> | undefined;
    try {
      await expect.poll(() => authenticated).toBe(2);
      await new Promise<void>((resolve) => setImmediate(resolve));
      closing = app.close();
      if (holdAuthentication) {
        await new Promise<void>((resolve) => setImmediate(resolve));
        authentication.resolve();
      }
      await expect.poll(() => closed, { timeout: 700 }).toBe(true);
      await closing;
      expect(m.blobs.size).toBe(0);
      expect(m.docs["session:upload-shutdown"].incidentIds).toEqual([]);
    } finally {
      authentication.resolve();
      body.end("\r\n--upload--\r\n");
      // If the old handler attaches a parser after destruction, wake it for
      // test cleanup only; the production fix must settle without this event.
      if (!closed && holdAuthentication && raw?.listenerCount("error"))
        raw.emit("error", new Error("Test upload cleanup"));
      await pending;
      await (closing ?? app.close());
    }
  },
);

async function setup(blockAfterInterrupted = false) {
  const m = memory();
  const entered = deferred();
  const finalRead = deferred();
  const release = deferred();
  let providerAborted = false;
  let resourcesClosed = false;
  let paused = false;
  let turnKey = "";
  const app = await buildApp({
    config: createConfig({}),
    ...m,
    db: {
      ...m.db,
      async get<T>(key: string) {
        if (
          blockAfterInterrupted &&
          !paused &&
          key.startsWith("incident:") &&
          m.docs[turnKey]?.turn.state === "interrupted"
        ) {
          paused = true;
          finalRead.resolve();
          await release.promise;
        }
        return m.db.get<T>(key);
      },
    },
    verifyToken: async () => "shutdown-test",
    provider: new FixtureProvider(),
    conversationProvider: {
      async *generate(input) {
        input.signal.addEventListener("abort", () => (providerAborted = true), {
          once: true,
        });
        entered.resolve();
        await new Promise(() => {});
        yield { type: "result", response: {} };
      },
    },
  });
  app.addHook("onClose", async () => {
    resourcesClosed = true;
  });
  const headers = {
    authorization: "Bearer local-test",
    "content-type": "application/json",
  };
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/session",
        headers,
        payload: {},
      })
    ).statusCode,
  ).toBe(200);
  const created = await app.inject({
    method: "POST",
    url: "/api/incidents",
    headers,
    payload: { reportText: "Fictional shutdown incident" },
  });
  expect(created.statusCode).toBe(201);
  const incident = created.json();
  const turnId = randomUUID();
  turnKey = `turn:${incident.id}:${turnId}`;
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  const controller = new AbortController();
  const response = await fetch(
    address + `/api/incidents/${incident.id}/turns`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ turnId, expectedRevision: 1, kind: "initial" }),
      signal: controller.signal,
    },
  );
  expect(response.status).toBe(200);
  await entered.promise;
  return {
    app,
    m,
    incident,
    turnKey,
    controller,
    response,
    finalRead,
    release,
    providerAborted: () => providerAborted,
    resourcesClosed: () => resourcesClosed,
  };
}

it("waits for a disconnected handler's final database read before closing resources", async () => {
  const s = await setup(true);
  let closing: Promise<void> | undefined;
  try {
    s.controller.abort();
    await s.response.body?.cancel().catch(() => {});
    await s.finalRead.promise;
    closing = s.app.close();
    await new Promise<void>((resolve) => setTimeout(resolve, 30));
    expect(s.resourcesClosed()).toBe(false);
    s.release.resolve();
    await closing;
    expect(s.resourcesClosed()).toBe(true);
    expect(s.m.docs[s.turnKey].turn.state).toBe("interrupted");
  } finally {
    s.release.resolve();
    s.controller.abort();
    s.app.server.closeAllConnections();
    await (closing ?? s.app.close());
  }
});

it("shutdown aborts an idle streaming provider and saves interruption without waiting for its deadline", async () => {
  const s = await setup();
  let closing: Promise<void> | undefined;
  try {
    closing = s.app.close();
    await expect.poll(s.providerAborted, { timeout: 700 }).toBe(true);
    await closing;
    expect(s.m.docs[s.turnKey].turn.state).toBe("interrupted");
    expect(s.m.docs[s.turnKey].turn.failureCode).toBe(
      "CONVERSATION_INTERRUPTED",
    );
    expect(s.m.docs[`incident:${s.incident.id}`].activeTurnId).toBeUndefined();
    expect(s.m.docs["session:shutdown-test"].activeLease).toBeUndefined();
    const body = await s.response.text();
    expect(body).toContain("CONVERSATION_INTERRUPTED");
    expect(body).not.toContain('"type":"completed"');
  } finally {
    s.controller.abort();
    s.app.server.closeAllConnections();
    await (closing ?? s.app.close());
  }
});

it.each(["preview", "analysis"] as const)(
  "shutdown cancels idle %s inference and releases its session lease",
  async (kind) => {
    const m = memory();
    const entered = deferred();
    let aborted = false;
    const wait = async (input: { signal: AbortSignal }) => {
      input.signal.addEventListener("abort", () => (aborted = true), {
        once: true,
      });
      entered.resolve();
      return new Promise(() => {});
    };
    const app = await buildApp({
      ...m,
      config: { ...createConfig({}), analysisTimeout: 1200 },
      verifyToken: async () => "inference-shutdown",
      provider: { analyze: wait },
      previewProvider: { preview: wait },
    });
    const headers = { authorization: "Bearer local-test" };
    await app.inject({ method: "POST", url: "/api/session", headers });
    const incident = (
      await app.inject({
        method: "POST",
        url: "/api/incidents",
        headers,
        payload: { sampleId: "explicit-threat" },
      })
    ).json();
    const pending = app.inject({
      method: "POST",
      headers,
      url:
        kind === "preview"
          ? "/api/report-preview"
          : `/api/incidents/${incident.id}/analyze`,
      ...(kind === "preview" ? { payload: { text: "Fictional report" } } : {}),
    });
    let closing: Promise<void> | undefined;
    try {
      await entered.promise;
      closing = app.close();
      await expect.poll(() => aborted, { timeout: 700 }).toBe(true);
      await closing;
      const response = await pending;
      expect(response.json()).toMatchObject(
        kind === "preview"
          ? { error: { code: "PREVIEW_INTERRUPTED" } }
          : { analysisState: "failed", failureCode: "ANALYSIS_INTERRUPTED" },
      );
      expect(m.docs["session:inference-shutdown"].activeLease).toBeUndefined();
      expect(m.blobs.size).toBe(1);
    } finally {
      // The old analysis implementation has no cancellation input; let its
      // short test deadline settle the route when observing the failing test.
      await (closing ?? app.close());
    }
  },
  5000,
);
