# Cloud Run container preparation — 2026-10-10

The API image has been built, smoke-tested, scanned and deployed for Linux amd64. See [deployment validation](evaluation.md) for verification scope and limitations. The frontend is built separately for Firebase Hosting; this image contains the API and scheduled-cleanup entry point.

## Build and check

From the repository root, with Docker running:

```sh
npm run container:build
npm run container:check
```

The build command explicitly targets `linux/amd64`, including on Apple Silicon. All stages use Node 22.23.2 Debian Trixie pinned by multi-platform manifest digest `sha256:c5849ff9c9ebcd66615412f0b548ca5b8ecaef84003dc9ac2e077ebe46aaa3f6`. Review and update the digest deliberately when refreshing the runtime. OS updates and Debian media packages are installed from their current repositories; this is not a fully reproducible OS package snapshot. npm, npx, Yarn and Corepack are removed from the runtime after build-stage installation.

API/contracts build dependencies and production dependencies are installed in separate stages using the committed lockfile. The runtime includes FFmpeg, ffprobe, the server and cleanup bundles, and the five fictional sample recordings/scripts. It excludes the frontend, test tools, broader voice evaluation and regression artifacts. The Docker build context allows only required manifests, source directories and sample assets, with additional exclusions for environment and conventional credential/key files. Never place credentials in source code or sample assets.

The image runs as the non-root `node` user, defaults to live inference and port 8080, and sends SIGTERM directly to Node. Cloud Run supplies `K_SERVICE` and `PORT`; the API binds to `0.0.0.0` in that environment. No credentials are baked into the image. Local `.env.live` is configured for local emulators and must not be used as the Cloud Run environment.

## What the smoke check establishes

The baseline image built and served requests, but failed the new content assertion because it shipped `fixtures/voice-evaluation`. The revised image passed architecture, non-root execution, health startup on custom port 8079 through a loopback-only published port, all five sample metadata/assets, missing-token rejection, real FFmpeg/ffprobe operation, absence of frontend/build tooling and evaluation artifacts, idle SIGTERM shutdown with exit zero within ten seconds, and rejection of emulator or implicit fixture configuration in a cloud environment.

The checker supplies a dummy project/model and no credentials. Health, sample metadata and an unauthenticated preview request do not call Gemini or Firebase data services. Every checker container has a generated name and cleanup, including a forced removal if a guard check times out. The image remains locally available after checking.

This is a container startup/runtime check, not deployed readiness or live cloud authorization. It does not validate in-flight persistence within Cloud Run's shutdown window, actual IAM, bucket access, cleanup-job execution, streaming through Hosting, or resource/load limits. `/api/health` is a process health endpoint, not a dependency connectivity probe.

## Cloud configuration template

| Setting                 | Configured value                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| `ANALYSIS_MODE`         | `live` (image default)                                                                    |
| `GOOGLE_CLOUD_PROJECT`  | `YOUR_PROJECT_ID`                                                          |
| `GEMINI_PROJECT_ID`     | Optional separate inference project; defaults to the project above                        |
| `GOOGLE_CLOUD_LOCATION` | `global`                                                                                 |
| `GEMINI_MODEL`          | `gemini-3.5-flash`                                                                        |
| `FIRESTORE_DATABASE_ID` | `emergency-copilot`                                                                      |
| `STORAGE_BUCKET`        | `YOUR_PRIVATE_BUCKET`                                              |
| `ALLOWED_ORIGIN`        | `https://app.example.invalid`                                            |
| `PORT`, `K_SERVICE`     | Supplied by Cloud Run; do not copy emulator variables                                     |

Use a dedicated Cloud Run service account with the required scoped access and platform-provided credentials. Provision Firebase Auth, Firestore and the private bucket, deploy the frontend with real Firebase browser configuration, and configure the cleanup job separately. See [the deployment sequence](deployment.md). An HTTP startup probe can use `/api/health` on the configured container port; configure probes in Cloud Run rather than relying on a Docker HEALTHCHECK.

Cloud Run requires an amd64 image, listening on `0.0.0.0` and its supplied port, and gives SIGTERM a ten-second grace period. See [Google's container contract](https://docs.cloud.google.com/run/docs/container-contract) and [health checks](https://docs.cloud.google.com/run/docs/configuring/healthchecks).

## Dependency findings

The scoped API/contracts production npm audit reported two moderate entries: `gaxios` and its transitive `uuid`, sharing [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq). No high or critical entries were reported in that scoped audit. These findings remain open; no forced dependency update was applied. This audit is not an OS/base-image scan, an assessment of exploitability, or a production security sign-off.

Prior cloud validation included image scanning and access checks. Unresolved dependency/media-library findings remain; account-specific scan records are retained privately. See [evaluation boundaries](evaluation.md). The runtime is a competition prototype, not a production security sign-off. No real service notification, Git commit or Git push occurred.
