import { afterEach, expect, it, vi } from "vitest";
import { apiRequest, audioUrl } from "../src/api";
import { streamConversation } from "../src/features/conversation/stream";
vi.mock("../src/firebase", () => ({
  ensureUser: async () => ({ getIdToken: async () => "test-user-token" }),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("sends authenticated JSON, audio and streaming calls directly to the configured Cloud Run origin", async () => {
  vi.stubEnv("VITE_API_ORIGIN", "https://api.example.invalid");
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(
      new Response("{}", { headers: { "content-type": "application/json" } }),
    )
    .mockResolvedValueOnce(new Response("audio"))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "completed",
          turnId: "turn",
          sequence: 1,
          snapshot: {},
        }) + "\n",
      ),
    );
  vi.stubGlobal("fetch", fetch);
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL() {
        return "blob:test";
      }
    },
  );
  await apiRequest("/incidents");
  await audioUrl("incident");
  await streamConversation(
    "/incidents/incident/turns",
    {},
    () => {},
    new AbortController().signal,
  );
  expect(fetch.mock.calls.map((call) => call[0])).toEqual([
    "https://api.example.invalid/api/incidents",
    "https://api.example.invalid/api/incidents/incident/audio",
    "https://api.example.invalid/api/incidents/incident/turns",
  ]);
  for (const [, options] of fetch.mock.calls)
    expect(new Headers(options?.headers).get("Authorization")).toBe(
      "Bearer test-user-token",
    );
});
it("keeps local API calls on the development proxy when no cloud origin is configured", async () => {
  vi.stubEnv("VITE_API_ORIGIN", "");
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", fetch);
  await apiRequest("/incidents");
  expect(fetch.mock.calls[0][0]).toBe("/api/incidents");
});
