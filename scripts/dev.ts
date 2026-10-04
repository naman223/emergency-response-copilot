import { spawn } from "node:child_process";
const child = spawn(
  "node_modules/.bin/firebase",
  [
    "emulators:exec",
    "--project",
    "demo-emergency-copilot",
    "--only",
    "auth,firestore,storage",
    "node --import tsx scripts/serve.ts",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      ANALYSIS_MODE: "fixture",
      GOOGLE_CLOUD_PROJECT: "demo-emergency-copilot",
      GCLOUD_PROJECT: "demo-emergency-copilot",
    },
  },
);
for (const s of ["SIGINT", "SIGTERM"] as const)
  process.on(s, () => child.kill(s));
child.on("exit", (code) => process.exit(code ?? 0));
