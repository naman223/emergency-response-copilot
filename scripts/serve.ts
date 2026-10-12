import { spawn } from "node:child_process";
const env = { ...process.env, VITE_USE_EMULATORS: "true" };
const children = [
  spawn(process.execPath, ["--import", "tsx", "apps/api/src/server.ts"], {
    stdio: "inherit",
    env,
  }),
  spawn("node_modules/.bin/vite", ["apps/web", "--host", "127.0.0.1"], {
    stdio: "inherit",
    env,
  }),
];
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const c of children) c.kill("SIGTERM");
}
for (const s of ["SIGINT", "SIGTERM"] as const) process.on(s, stop);
for (const c of children) c.on("exit", () => stop());
