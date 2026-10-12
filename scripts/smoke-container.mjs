import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

const image = process.argv[2] ?? "emergency-copilot-api:cloud-check";
const name = `copilot-container-check-${randomUUID()}`;
const port = 8079;
const docker = (args, timeout = 30000) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    timeout,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const environment = [
  "K_SERVICE=container-check",
  "ANALYSIS_MODE=live",
  "GOOGLE_CLOUD_PROJECT=demo-emergency-copilot",
  "GEMINI_MODEL=container-check-unused",
  "GOOGLE_CLOUD_LOCATION=global",
  "ALLOWED_ORIGIN=https://container-check.invalid",
  "GCE_METADATA_HOST=127.0.0.1:9",
];
const envArgs = environment.flatMap((value) => ["--env", value]);
const removeContainer = (containerName) => {
  try {
    docker(["rm", "--force", containerName]);
  } catch (error) {
    if (
      error.status !== 1 ||
      !String(error.stderr).includes("No such container")
    )
      throw error;
  }
};

const [metadata] = JSON.parse(docker(["image", "inspect", image]));
assert.equal(metadata.Os, "linux");
assert.equal(metadata.Architecture, "amd64", "Cloud Run requires linux/amd64");
assert.equal(metadata.Config.User, "node");
assert.deepEqual(metadata.Config.Cmd, ["node", "apps/api/dist/server.js"]);

try {
  docker([
    "run",
    "--detach",
    "--platform",
    "linux/amd64",
    "--name",
    name,
    "--publish",
    `127.0.0.1::${port}`,
    ...envArgs,
    "--env",
    `PORT=${port}`,
    image,
  ]);
  const published = docker(["port", name, `${port}/tcp`]);
  assert.match(published, /^127\.0\.0\.1:\d+$/);
  const base = `http://${published}`;
  const deadline = Date.now() + 30000;
  let healthy = false;
  while (Date.now() < deadline) {
    const [container] = JSON.parse(docker(["inspect", name]));
    assert.equal(container.State.Running, true, docker(["logs", name]));
    try {
      const response = await fetch(`${base}/api/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) {
        assert.deepEqual(await response.json(), { ok: true });
        healthy = true;
        break;
      }
    } catch {}
    await delay(200);
  }
  assert.ok(healthy, "Container did not become healthy on the supplied PORT");
  const samples = await fetch(`${base}/api/samples`, {
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(samples.status, 200);
  const sampleBody = await samples.json();
  assert.equal(sampleBody.mode, "live");
  assert.equal(sampleBody.samples.length, 5);
  const protectedResponse = await fetch(`${base}/api/report-preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "Fictional container smoke test" }),
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(protectedResponse.status, 401);

  docker([
    "exec",
    name,
    "node",
    "--input-type=module",
    "-e",
    `
    import assert from 'node:assert/strict';
    import { existsSync, readFileSync } from 'node:fs';
    import { createRequire } from 'node:module';
    import { execFileSync } from 'node:child_process';
    const require = createRequire('/app/apps/api/package.json');
    assert.notEqual(process.getuid(), 0);
    for (const file of ['server.js', 'cleanup.js'])
      assert.ok(existsSync('/app/apps/api/dist/' + file));
    const manifest = JSON.parse(readFileSync('/app/fixtures/manifest.json', 'utf8'));
    for (const sample of manifest) {
      for (const [directory, extension] of [['audio', 'wav'], ['expected', 'json'], ['conversations', 'json']])
        assert.ok(existsSync('/app/fixtures/' + directory + '/' + sample.id + '.' + extension), sample.id);
    }
    for (const path of ['.env.live', '.git', 'apps/api/test', 'apps/web',
      'fixtures/voice-evaluation', 'fixtures/regressions'])
      assert.equal(existsSync('/app/' + path), false, path + ' must not be shipped');
    for (const dependency of ['react', 'vite', 'esbuild', 'firebase-tools'])
      assert.throws(() => require.resolve(dependency), { code: 'MODULE_NOT_FOUND' });
    for (const path of ['/usr/local/lib/node_modules/npm', '/usr/local/bin/npm',
      '/usr/local/bin/npx', '/usr/local/bin/yarn', '/usr/local/bin/corepack'])
      assert.equal(existsSync(path), false, path + ' is not needed in the runtime');
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i',
      'anullsrc=r=16000:cl=mono', '-t', '0.1', '-y', '/tmp/container-check.wav']);
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error',
      '-show_streams', '-of', 'json', '/tmp/container-check.wav'], {encoding:'utf8'}));
    assert.equal(probe.streams[0].sample_rate, '16000');
    assert.equal(probe.streams[0].channels, 1);
  `,
  ]);
  const stopStarted = Date.now();
  docker(["stop", "--time", "10", name], 15000);
  const [stopped] = JSON.parse(docker(["inspect", name]));
  assert.equal(stopped.State.ExitCode, 0, "SIGTERM must not require SIGKILL");
  assert.ok(
    Date.now() - stopStarted < 10000,
    "Shutdown exceeded Cloud Run's grace period",
  );
  console.log(
    "Container architecture, startup, auth boundary, media, contents and SIGTERM checks passed",
  );
} finally {
  removeContainer(name);
}

for (const [extra, expected] of [
  [
    ["--env", "FIRESTORE_EMULATOR_HOST=127.0.0.1:8180"],
    "Emulators are forbidden on Cloud Run",
  ],
  [
    ["--env", "ANALYSIS_MODE=fixture"],
    "Cloud fixtures require explicit opt-in",
  ],
]) {
  const guardName = `copilot-container-check-${randomUUID()}`;
  let rejected = false;
  try {
    docker([
      "run",
      "--rm",
      "--name",
      guardName,
      "--network",
      "none",
      "--platform",
      "linux/amd64",
      ...envArgs,
      ...extra,
      image,
    ]);
  } catch (error) {
    assert.equal(error.status, 1);
    assert.match(String(error.stderr), new RegExp(expected));
    rejected = true;
  } finally {
    removeContainer(guardName);
  }
  assert.ok(rejected, `Unsafe cloud configuration was accepted: ${expected}`);
}
console.log(
  "Cloud emulator/fixture configuration rejection checks passed; no live inference or database calls made",
);
