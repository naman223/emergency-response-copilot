import { afterEach, expect, it, vi } from "vitest";
import { apiRequest } from "../src/api";
const dependencies = vi.hoisted(() => ({ ensureUser: vi.fn() }));
vi.mock("../src/firebase", () => ({ ensureUser: dependencies.ensureUser }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.each(["sign-in", "token", "response body"] as const)(
  "ends the request when cancelled during %s and prevents a late upload",
  async (stage) => {
    let release!: (value: any) => void;
    const gate = new Promise<any>((resolve) => (release = resolve));
    const user = {
      getIdToken: async () => (stage === "token" ? gate : "test-token"),
    };
    dependencies.ensureUser.mockImplementation(async () =>
      stage === "sign-in" ? gate : user,
    );
    let body!: ReadableStreamDefaultController<Uint8Array>;
    const transport = vi.fn<typeof fetch>(async () =>
      stage === "response body"
        ? new Response(
            new ReadableStream({
              start(controller) {
                body = controller;
              },
            }),
          )
        : new Response("{}"),
    );
    vi.stubGlobal("fetch", transport);
    const controller = new AbortController();
    const pending = apiRequest("/report-preview", {
      method: "POST",
      body: JSON.stringify({ text: "Fictional cancellation test" }),
      signal: controller.signal,
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    controller.abort(new DOMException("Preview timed out", "AbortError"));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await expect(
        Promise.race([
          pending,
          new Promise((resolve) => {
            timer = setTimeout(() => resolve("still pending"), 100);
          }),
        ]),
      ).rejects.toMatchObject({ name: "AbortError" });
    } finally {
      if (timer) clearTimeout(timer);
      release(stage === "sign-in" ? user : "test-token");
      if (stage === "response body") {
        body.enqueue(new TextEncoder().encode("{}"));
        body.close();
      }
      await pending.catch(() => {});
    }
    if (stage !== "response body") expect(transport).not.toHaveBeenCalled();
  },
);
