import { it, expect } from "vitest";
import { localEnvironment } from "./local-env";
it("keeps the default demo offline despite inherited live settings", () => {
  const env = localEnvironment(
    {
      ANALYSIS_MODE: "live",
      GOOGLE_CLOUD_PROJECT: "cloud-project",
      VITE_FIREBASE_PROJECT_ID: "cloud-project",
    },
    false,
  );
  expect(env.ANALYSIS_MODE).toBe("fixture");
  expect(env.GOOGLE_CLOUD_PROJECT).toBe("demo-emergency-copilot");
  expect(env.VITE_FIREBASE_PROJECT_ID).toBe("demo-emergency-copilot");
});
it("routes live inference separately from emulator data", () => {
  const env = localEnvironment(
    {
      GEMINI_PROJECT_ID: "emergency-response-copilot",
      GEMINI_MODEL: "test-model",
      STORAGE_BUCKET: "production-bucket",
    },
    true,
  );
  expect(env.ANALYSIS_MODE).toBe("live");
  expect(env.GEMINI_PROJECT_ID).toBe("emergency-response-copilot");
  expect(env.GOOGLE_CLOUD_PROJECT).toBe("demo-emergency-copilot");
  expect(env.STORAGE_BUCKET).toBe("demo-emergency-copilot.appspot.com");
  expect(env.VITE_USE_EMULATORS).toBe("true");
});
it("rejects missing live settings and demo inference projects", () => {
  expect(() => localEnvironment({}, true)).toThrow();
  expect(() =>
    localEnvironment(
      { GEMINI_PROJECT_ID: "demo-example", GEMINI_MODEL: "test-model" },
      true,
    ),
  ).toThrow();
});
