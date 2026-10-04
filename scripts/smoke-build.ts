import { spawn } from "node:child_process";
const child = spawn(process.execPath, ["apps/api/dist/server.js"], {
  env: {
    ...process.env,
    PORT: "8182",
    ANALYSIS_MODE: "fixture",
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:8180",
    FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
    FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
child.stdout.on("data", (c) => (output += c));
child.stderr.on("data", (c) => (output += c));
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw Error(output);
    try {
      const r = await fetch("http://127.0.0.1:8182/api/health");
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!ready) throw Error("Built API did not start");
  console.log("Built API health check passed");
} finally {
  child.kill("SIGTERM");
}
