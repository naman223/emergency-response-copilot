import { spawn } from "node:child_process";
import { localEnvironment } from "./local-env";
const env = localEnvironment(process.env, process.argv.includes("--live"));
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
    env,
  },
);
for (const s of ["SIGINT", "SIGTERM"] as const)
  process.on(s, () => child.kill(s));
child.on("exit", (code) => process.exit(code ?? 0));
