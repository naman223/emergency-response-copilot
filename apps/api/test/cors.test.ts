import { expect, it } from "vitest";
import { buildApp } from "../src/app";
import { createConfig } from "../src/config";
import { FixtureProvider } from "../src/analysis/fixture";
import { memory } from "./helpers";

const origin = "https://copilot.example.test";
const reviewPath = "/api/incidents/00000000-0000-4000-8000-000000000001/review";
async function setup() {
  return buildApp({
    ...memory(),
    config: createConfig({ ALLOWED_ORIGIN: origin }),
    provider: new FixtureProvider(),
    verifyToken: async () => "cors-test",
  });
}

it.each([
  ["PATCH", reviewPath],
  ["DELETE", "/api/session"],
] as const)("allows the browser preflight for %s %s", async (method, url) => {
  const app = await setup();
  try {
    const response = await app.inject({
      method: "OPTIONS",
      url,
      headers: {
        origin,
        "access-control-request-method": method,
        "access-control-request-headers": "authorization,content-type",
      },
    });
    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(origin);
    expect(
      String(response.headers["access-control-allow-methods"]).split(/\s*,\s*/),
    ).toContain(method);
    const headers = String(
      response.headers["access-control-allow-headers"],
    ).toLowerCase();
    expect(headers).toContain("authorization");
    expect(headers).toContain("content-type");
  } finally {
    await app.close();
  }
});

it.each([
  ["PATCH", reviewPath],
  ["DELETE", "/api/session"],
] as const)("still requires authentication for %s %s", async (method, url) => {
  const app = await setup();
  try {
    const response = await app.inject({ method, url, headers: { origin } });
    expect(response.statusCode).toBe(401);
  } finally {
    await app.close();
  }
});

it("rejects draft saves from an unapproved origin", async () => {
  const app = await setup();
  try {
    const response = await app.inject({
      method: "PATCH",
      url: reviewPath,
      headers: { origin: "https://unapproved.example.test" },
    });
    expect(response.statusCode).toBe(403);
  } finally {
    await app.close();
  }
});
