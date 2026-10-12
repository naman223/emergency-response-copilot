# Google Cloud deployment

This repository contains runnable prototype source and configuration templates. Actual project IDs, deployed endpoints, service-account identities, credentials and operational records are operator-only and excluded from Git. The deployed prototype link is provided separately in the competition submission.

## Configure a deployment

1. Select your billing-enabled Google Cloud project and enable the required Firebase, Firestore, Storage, Cloud Run, Artifact Registry, Vertex AI, Scheduler and Maps APIs. Register a Firebase web app.
2. Copy `.env.example` to an ignored `.env.cloud.local`. Supply your Firebase browser configuration, restricted Maps browser key and API origin. Keep `VITE_USE_EMULATORS=false`. Never place service-account keys or access tokens in browser variables.
3. Copy `firebase.cloud.example.json` to ignored `firebase.cloud.json`; select your dedicated Hosting site and named database. Copy `docs/cloud-runtime.example.yaml` to an ignored runtime file and replace every placeholder.
4. Build and check the backend with `npm run container:build` and `npm run container:check`. Push the exact verified image to your Artifact Registry repository. The image contains the API, cleanup entry point, FFmpeg and five fictional samples; it runs as a non-root user.
5. Deploy the image to Cloud Run using a dedicated keyless runtime identity with only required Vertex AI, named-database and private-bucket access. Cloud mode rejects emulator configuration. Initial prototype settings: zero minimum/two maximum instances, concurrency 4, a 120-second request timeout, one CPU and 1 GiB memory. These are not a spending cap.
6. Build the frontend with `npm run build --workspace @copilot/web -- --mode cloud`, then deploy the dedicated Hosting site and Firestore rules. The frontend calls the configured API origin directly. Permit public HTTP invocation only when explicitly authorizing a public demo; application Firebase and ownership checks remain mandatory.
7. Deploy the private cleanup job using the same image and `node apps/api/dist/cleanup.js`. Give a separate scheduler identity only permission to invoke that job. Run hourly, and verify a manual execution. Resume a paused scheduler before requesting its manual run.
8. Verify live text/audio, map confirmation, human-approved simulated handoff, reload persistence, session isolation, reset and cleanup. Keep actual URLs, identities, logs and evidence in ignored operator files.

## Boundaries

Firebase client configuration and restricted Maps browser keys are visible to a browser by design. A browser's API address is also visible in network requests; hiding it is not access control. No backend credentials belong in the frontend, source, image or Git history.

Retained storage and background jobs can incur charges. Provider/model availability and pricing can change. The application is a simulation, not a production emergency-dispatch service. See [technical brief](technical-brief.md), [evaluation boundaries](evaluation.md) and [publication hygiene](publication-hygiene.md).
