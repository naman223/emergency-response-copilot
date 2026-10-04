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
