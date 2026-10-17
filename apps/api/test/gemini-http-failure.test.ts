import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "@google/genai";
import { createRequire } from "node:module";
import { createConfig } from "../src/config";
import { GeminiConversationProvider } from "../src/conversation/gemini";
import { GeminiReportPreviewProvider } from "../src/incidents/report-preview";
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
  "preserves and classifies HTTP %i from the configured Vertex SDK with bounded recovery",
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
    expect(transport).toHaveBeenCalledTimes(status === 403 ? 1 : 2);
    expect(String(transport.mock.calls[0]?.[0])).toContain(
      "/projects/local-transport-test/locations/global/",
    );
    expect(chunks).toEqual([]);
  },
);

it("preserves a network failure category after bounded recovery without publishing chunks", async () => {
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
  expect(transport).toHaveBeenCalledTimes(2);
  expect(chunks).toEqual([]);
});

it("uses the separate transcription model and returns a real decoded transcript", async () => {
  const transcript = "Fictional report near the north gate.";
  let sent: any;
  let url = "";
  vi.stubGlobal("fetch", async (input: any, init: any) => {
    url = String(input);
    sent = JSON.parse(init.body);
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    transcript,
                    locationDescription: "the north gate",
                  }),
                },
              ],
            },
            finishReason: "STOP",
          },
        ],
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  });
  const p = new GeminiReportPreviewProvider(
    createConfig({
      ANALYSIS_MODE: "live",
      GOOGLE_CLOUD_PROJECT: "local-transport-test",
      GEMINI_MODEL: "gemini-3.5-flash",
      GEMINI_PREVIEW_MODEL: "gemini-2.5-flash",
    }),
  );
  await expect(
    p.preview({
      wav: new Uint8Array([1, 2]),
      signal: new AbortController().signal,
    }),
  ).resolves.toEqual({ transcript, locationDescription: "the north gate" });
  expect(url).toContain("gemini-2.5-flash:generateContent");
  expect(sent.generationConfig.thinkingConfig).toBeUndefined();
});

it("preserves an upstream transcription deadline without retrying", async () => {
  const transport = vi.fn<typeof fetch>(
    async () =>
      new Response(
        JSON.stringify({
          error: { code: 504, message: "private provider response" },
        }),
        { status: 504, headers: { "Content-Type": "application/json" } },
      ),
  );
  vi.stubGlobal("fetch", transport);
  const p = new GeminiReportPreviewProvider(
    createConfig({
      ANALYSIS_MODE: "live",
      GOOGLE_CLOUD_PROJECT: "local-transport-test",
      GEMINI_MODEL: "gemini-3.5-flash",
    }),
  );
  await expect(
    p.preview({
      text: "Fictional report.",
      signal: new AbortController().signal,
    }),
  ).rejects.toMatchObject({ status: 504 });
  expect(transport).toHaveBeenCalledTimes(1);
});

it("uses supported low thinking and room for transcript JSON with the latest Flash model", async () => {
  let sent: any;
  let url = "";
  const transcript = "Fictional report near the north gate.";
  vi.stubGlobal("fetch", async (input: any, init: any) => {
    url = String(input);
    sent = JSON.parse(init.body);
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    transcript,
                    locationDescription: "the north gate",
                  }),
                },
              ],
            },
            finishReason: "STOP",
          },
        ],
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  });
  const p = new GeminiReportPreviewProvider(
    createConfig({
      ANALYSIS_MODE: "live",
      GOOGLE_CLOUD_PROJECT: "local-transport-test",
      GEMINI_MODEL: "gemini-3.8-flash",
    }),
  );
  await expect(
    p.preview({
      wav: new Uint8Array([1, 2]),
      signal: new AbortController().signal,
    }),
  ).resolves.toEqual({ transcript, locationDescription: "the north gate" });
  expect(url).toContain("gemini-3.8-flash:generateContent");
  expect(sent.generationConfig.thinkingConfig).toEqual({
    thinkingLevel: "LOW",
  });
  expect(sent.generationConfig.maxOutputTokens).toBe(4096);
});
