import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { samples, fixtureRoot } from "../incidents/service";
import { AppError } from "../errors";
import type { AnalysisProvider } from "./provider";
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
export class FixtureProvider implements AnalysisProvider {
  async analyze({ wav }: { wav: Uint8Array; signal: AbortSignal }) {
    for (const sample of await samples()) {
      const known = await readFile(
        resolve(fixtureRoot(), "audio", sample.id + ".wav"),
      );
      if (hash(known) === hash(wav))
        return JSON.parse(
          await readFile(
            resolve(fixtureRoot(), "expected", sample.id + ".json"),
            "utf8",
          ),
        );
    }
    throw new AppError(
      400,
      "FIXTURE_ONLY",
      "Local fixture mode only analyzes the provided sample recordings. Configure live mode to analyze your own audio.",
    );
  }
}
