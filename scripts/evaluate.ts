import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseModelBrief } from "@copilot/contracts";
import { FixtureProvider } from "../apps/api/src/analysis/fixture";
import { GeminiProvider } from "../apps/api/src/analysis/gemini";
import { createConfig } from "../apps/api/src/config";
import { samples, fixtureRoot } from "../apps/api/src/incidents/service";
const mode = process.argv[process.argv.indexOf("--mode") + 1] ?? "fixture";
if (!["fixture", "live"].includes(mode))
  throw Error("Use --mode fixture or --mode live");
const config = createConfig({ ...process.env, ANALYSIS_MODE: mode });
const provider =
  mode === "live" ? new GeminiProvider(config) : new FixtureProvider();
const rows = [];
for (const s of await samples()) {
  const start = performance.now();
  try {
    const expected = JSON.parse(
      await readFile(
        resolve(fixtureRoot(), "expected", s.id + ".json"),
        "utf8",
      ),
    );
    const brief = parseModelBrief(
      await provider.analyze({
        wav: await readFile(resolve(fixtureRoot(), "audio", s.id + ".wav")),
        signal: AbortSignal.timeout(45000),
      }),
    );
    rows.push({
      sample: s.id,
      latencyMs: Math.round(performance.now() - start),
      fieldMismatches: ["urgency", "routing"].filter(
        (k) => (brief as any)[k] !== expected[k],
      ),
      unverifiedQuotes: brief.facts.filter(
        (f) => f.evidenceStatus === "unverified",
      ).length,
    });
  } catch {
    rows.push({
      sample: s.id,
      failed: true,
      latencyMs: Math.round(performance.now() - start),
    });
  }
}
console.log(
  JSON.stringify(
    {
      mode,
      note:
        mode === "fixture"
          ? "Deterministic fixture smoke check. This is not a model accuracy evaluation."
          : "Small synthetic-case check, not emergency-response accuracy or calibration.",
      date: new Date().toISOString(),
      model: mode === "live" ? config.model : null,
      rows,
    },
    null,
    2,
  ),
);
if (rows.some((r) => "failed" in r)) process.exitCode = 1;
