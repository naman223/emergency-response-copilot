import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { createServer, connect } from "node:net";
import { expect, it } from "vitest";
import { buildApp } from "../src/app";
import { createConfig } from "../src/config";
import { createFirebase } from "../src/infra/firebase";
import { FixtureProvider } from "../src/analysis/fixture";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}
async function user() {
  const response = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ returnSecureToken: true }),
    },
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { idToken: string; localId: string };
  return {
    headers: { authorization: `Bearer ${body.idToken}` },
    uid: body.localId,
  };
}

it("disconnect and shutdown drain real Firestore work before disposal and preserve interruption on reload", async () => {
  const config = {
    ...createConfig({ ...process.env, ANALYSIS_MODE: "fixture" }),
    analysisTimeout: 4000,
  };
  const firebase = createFirebase(config);
  const entered = deferred(),
    blocked = deferred(),
    release = deferred();
  let key = "",
    paused = false,
    disposed = false,
    readsAfterDispose = 0,
    aborted = false;
  const app = await buildApp({
    config,
    ...firebase,
    provider: new FixtureProvider(),
    db: {
      ...firebase.db,
      async get<T>(recordKey: string) {
        if (disposed) readsAfterDispose++;
        if (
          !paused &&
          key &&
          recordKey.startsWith("incident:") &&
          (await firebase.db.get<any>(key))?.turn.state === "interrupted"
        ) {
          paused = true;
          blocked.resolve();
          await release.promise;
        }
        return firebase.db.get<T>(recordKey);
      },
    },
    conversationProvider: {
      async *generate(input) {
        input.signal.addEventListener("abort", () => (aborted = true), {
          once: true,
        });
        entered.resolve();
        await new Promise(() => {});
        yield { type: "result", response: {} };
      },
    },
  });
  const closed = deferred();
  app.addHook("onClose", async () => {
    disposed = true;
    await firebase.close();
    closed.resolve();
  });
  const { headers, uid } = await user();
  expect(
    (await app.inject({ method: "POST", url: "/api/session", headers }))
      .statusCode,
  ).toBe(200);
  const created = await app.inject({
    method: "POST",
    url: "/api/incidents",
    headers,
    payload: { reportText: "Fictional Firestore shutdown regression" },
  });
  expect(created.statusCode).toBe(201);
  const incident = created.json(),
    turnId = randomUUID();
  key = `turn:${incident.id}:${turnId}`;
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  const controller = new AbortController();
  let closing: Promise<void> | undefined;
  try {
    const response = await fetch(
      address + `/api/incidents/${incident.id}/turns`,
      {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ turnId, kind: "initial", expectedRevision: 1 }),
        signal: controller.signal,
      },
    );
    expect(response.status).toBe(200);
    await entered.promise;
    controller.abort();
    await response.body?.cancel().catch(() => {});
    await blocked.promise;
    closing = app.close();
    await new Promise<void>((resolve) => setTimeout(resolve, 30));
    expect(disposed).toBe(false);
    release.resolve();
    await closing;
    await closed.promise;
    expect(aborted).toBe(true);
    expect(readsAfterDispose).toBe(0);
    const reload = createFirebase(config);
    try {
      expect((await reload.db.get<any>(key)).turn).toMatchObject({
        state: "interrupted",
        failureCode: "CONVERSATION_INTERRUPTED",
        officerText: "Fictional Firestore shutdown regression",
      });
      expect(
        (await reload.db.get<any>(`session:${uid}`)).activeLease,
      ).toBeUndefined();
      expect(
        (await reload.db.get<any>(`incident:${incident.id}`)).activeTurnId,
      ).toBeUndefined();
    } finally {
      await reload.close();
    }
  } finally {
    release.resolve();
    controller.abort();
    await (closing ?? app.close());
  }
}, 15000);

it("the API process handles mixed repeated shutdown signals and unfinished HTTP connections cleanly", async () => {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "apps/api/src/server.ts"],
    {
      env: {
        ...process.env,
        PORT: String(port),
        ANALYSIS_MODE: "fixture",
        GOOGLE_CLOUD_PROJECT: "demo-emergency-copilot",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stderr = "";
  child.stderr.on("data", (data) => (stderr += data));
  child.stdout.resume();
  const exit = once(child, "exit");
  let socket: ReturnType<typeof connect> | undefined;
  try {
    await expect
      .poll(
        async () => {
          try {
            return (await fetch(`http://127.0.0.1:${port}/api/health`)).status;
          } catch {
            return 0;
          }
        },
        { timeout: 5000 },
      )
      .toBe(200);
    const { headers } = await user();
    expect(
      (
        await fetch(`http://127.0.0.1:${port}/api/session`, {
          method: "POST",
          headers,
        })
      ).status,
    ).toBe(200);
    socket = connect(port, "127.0.0.1");
    await once(socket, "connect");
    socket.write(
      "POST /api/incidents HTTP/1.1\r\nHost: localhost\r\nContent-Length: 1000\r\n\r\n{",
    );
    child.kill("SIGTERM");
    child.kill("SIGINT");
    await expect
      .poll(() => child.exitCode ?? child.signalCode, { timeout: 4000 })
      .toBe(0);
    expect(await exit).toEqual([0, null]);
    expect(stderr).not.toMatch(
      /already been terminated|already deleted|unhandled|Error:/i,
    );
  } finally {
    socket?.destroy();
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
    await exit;
  }
}, 15000);
