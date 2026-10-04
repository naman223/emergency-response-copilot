import { it, expect } from "vitest";
import { createConfig } from "../src/config";
it("rejects emulator bypasses in deployed environments", () =>
  expect(() =>
    createConfig({
      K_SERVICE: "api",
      FIRESTORE_EMULATOR_HOST: "localhost:8080",
    }),
  ).toThrow());
it("requires explicit project and model for live inference", () =>
  expect(() => createConfig({ ANALYSIS_MODE: "live" })).toThrow());
it("separates emulator storage from the live Gemini project", () => {
  const config = createConfig({
    ANALYSIS_MODE: "live",
    GOOGLE_CLOUD_PROJECT: "demo-emergency-copilot",
    GEMINI_PROJECT_ID: "emergency-response-copilot",
    GEMINI_MODEL: "test-model",
  });
  expect(config.projectId).toBe("demo-emergency-copilot");
  expect(config.geminiProjectId).toBe("emergency-response-copilot");
});
