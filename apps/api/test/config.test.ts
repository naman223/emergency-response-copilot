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
    GEMINI_PROJECT_ID: "live-inference-project",
    GEMINI_MODEL: "test-model",
  });
  expect(config.projectId).toBe("demo-emergency-copilot");
  expect(config.geminiProjectId).toBe("live-inference-project");
});
it("isolates a cloud demo in a named database while preserving local defaults", () => {
  expect(createConfig({}).databaseId).toBe("(default)");
  expect(
    createConfig({ FIRESTORE_DATABASE_ID: "emergency-copilot" }).databaseId,
  ).toBe("emergency-copilot");
});

it("selects a preview model independently and defaults to the assessment model", () => {
  const base = {
    ANALYSIS_MODE: "live",
    GOOGLE_CLOUD_PROJECT: "local-test",
    GEMINI_MODEL: "gemini-3.5-flash",
  };
  expect(createConfig(base).previewModel).toBe("gemini-3.5-flash");
  const config = createConfig({
    ...base,
    GEMINI_PREVIEW_MODEL: "gemini-2.5-flash",
  });
  expect(config.previewModel).toBe("gemini-2.5-flash");
  expect(config.model).toBe("gemini-3.5-flash");
});
