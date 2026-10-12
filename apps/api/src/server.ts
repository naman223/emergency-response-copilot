import { createConfig } from "./config";
import { createFirebase } from "./infra/firebase";
import { buildApp } from "./app";
import { FixtureProvider } from "./analysis/fixture";
import { GeminiProvider } from "./analysis/gemini";
const config = createConfig();
const firebase = createFirebase(config);
const provider =
  config.mode === "live" ? new GeminiProvider(config) : new FixtureProvider();
const app = await buildApp({ config, ...firebase, provider });
await app.listen({
  port: config.port,
  host: config.cloud ? "0.0.0.0" : "127.0.0.1",
});
console.log(`Copilot API listening on ${config.port} (${config.mode} mode)`);
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  void (async () => {
    await app.close();
    await firebase.close();
  })().then(
    () => process.exit(0),
    () => {
      console.error(
        "Copilot API shutdown could not finish. Reload after restart to recover saved work.",
      );
      process.exit(1);
    },
  );
}
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, stop);
