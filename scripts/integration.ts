import { spawnSync } from "node:child_process";
const filters = process.argv.slice(2);
const command = [
  "node_modules/.bin/vitest",
  "run",
  "--no-file-parallelism",
  ...(filters.length ? filters : ["apps/api/test/*.integration.test.ts"]),
].join(" ");
const r = spawnSync(
  "node_modules/.bin/firebase",
  [
    "emulators:exec",
    "--project",
    "demo-emergency-copilot",
    "--only",
    "auth,firestore,storage",
    command,
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      GOOGLE_CLOUD_PROJECT: "demo-emergency-copilot",
      ANALYSIS_MODE: "fixture",
      GCLOUD_PROJECT: "demo-emergency-copilot",
    },
  },
);
process.exit(r.status ?? 1);
