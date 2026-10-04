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
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, async () => {
    await app.close();
    await firebase.close();
    process.exit(0);
  });
