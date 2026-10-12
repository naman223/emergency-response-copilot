import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "@google/genai";
import { createRequire } from "node:module";
import { createConfig } from "../src/config";
import { GeminiConversationProvider } from "../src/conversation/gemini";
import { conversationFailureCode } from "../src/conversation/failure";
import type { ProviderChunk } from "../src/conversation/provider";

// Resolve from the SDK: it can install a different google-auth-library version
// than other API dependencies, so spying on the root package misses SDK auth.
const require = createRequire(import.meta.url);
const sdkRequire = createRequire(require.resolve("@google/genai"));
const { GoogleAuth } = sdkRequire("google-auth-library") as {
  GoogleAuth: {
    prototype: { getRequestHeaders(url?: string): Promise<Headers> };
  };
};

beforeEach(() => {
  // Keep Vertex authentication deterministic and never consult credentials or
  // metadata servers. Model requests are intercepted by the fetch stub below.
  vi.spyOn(GoogleAuth.prototype, "getRequestHeaders").mockResolvedValue(
    new Headers({ Authorization: "Bearer local-test-token" }),
  );
  vi.stubEnv("GOOGLE_API_KEY", "");
  vi.stubEnv("GEMINI_API_KEY", "");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function provider() {
  return new GeminiConversationProvider(
    createConfig({
      ANALYSIS_MODE: "live",
      GOOGLE_CLOUD_PROJECT: "local-transport-test",
      GOOGLE_CLOUD_LOCATION: "global",
      GEMINI_MODEL: "gemini-2.5-flash",
    }),
  );
}

async function consume(chunks: ProviderChunk[]) {
  for await (const chunk of provider().generate({
    report: { text: "Fictional report for a controlled transport test." },
    turns: [],
    signal: new AbortController().signal,
  }))
    chunks.push(chunk);
}

it.each([
  [429, "MODEL_RATE_LIMITED"],
  [503, "MODEL_UNAVAILABLE"],
  [403, "MODEL_CONFIGURATION"],
  [504, "MODEL_TIMEOUT"],
])(
  "preserves and classifies HTTP %i from the configured Vertex SDK without retrying",
  async (status, code) => {
    const transport = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            error: { code: status, message: "private provider response" },
          }),
          { status, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", transport);
    const chunks: ProviderChunk[] = [];
    let failure: unknown;
    try {
      await consume(chunks);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ status });
    expect(conversationFailureCode(failure)).toBe(code);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(String(transport.mock.calls[0]?.[0])).toContain(
      "/projects/local-transport-test/locations/global/",
    );
    expect(chunks).toEqual([]);
  },
);

it("preserves a network failure category without retrying or publishing chunks", async () => {
  const failure = new TypeError("private network details", {
    cause: { code: "ECONNRESET" },
  });
  const transport = vi.fn<typeof fetch>(async () => {
    throw failure;
  });
  vi.stubGlobal("fetch", transport);
  const chunks: ProviderChunk[] = [];
  await expect(consume(chunks)).rejects.toBe(failure);
  expect(conversationFailureCode(failure)).toBe("MODEL_CONNECTION_FAILED");
  expect(transport).toHaveBeenCalledTimes(1);
  expect(chunks).toEqual([]);
});
