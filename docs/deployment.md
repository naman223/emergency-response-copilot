# Later Google Cloud deployment

Status: configuration prepared; not deployed. The user requested local development first and will provide a project later.

## Project prerequisites

Select a Google Cloud project with billing, enable the relevant Cloud Run, Cloud Build, Artifact Registry, Vertex AI, Firestore, Storage and Firebase services, and register a Firebase web app. Enable anonymous Firebase authentication for the isolated judging sandbox. Create Firestore and a private audio bucket in deliberately selected locations. Choose a currently available Gemini model that supports audio input and structured output; the application does not assume a hardcoded model remains available.

Use application-default credentials for local live experiments and a dedicated Cloud Run service account in cloud deployment. Grant only the required Vertex AI invocation, Firestore access, and private bucket object permissions. Do not create or commit service-account keys. The Firebase browser web configuration is not a backend credential; authorization still depends on verified tokens and ownership checks.

## Build and deploy when project access is provided

1. Set the real `VITE_FIREBASE_*` values from `.env.example` for the frontend build; do not enable emulator mode. Build the web app with `npm run build --workspace @copilot/web`.
2. Build the backend from repository root: `docker build -f apps/api/Dockerfile -t emergency-copilot-api .`. The multi-stage image bundles the shared schemas, installs FFmpeg, and runs as a non-root user.
3. Deploy that image to Cloud Run with `ANALYSIS_MODE=live`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, `GEMINI_MODEL`, `STORAGE_BUCKET`, and the exact HTTPS `ALLOWED_ORIGIN`. Never set emulator variables in Cloud Run. Match the service name/region in `firebase.json` to the chosen deployment.
4. Permit external HTTP requests to the service as needed for Hosting integration; the application still requires Firebase bearer tokens on all private endpoints. Use a 120-second request timeout, concurrency 4, and maximum 2 instances as initial prototype settings. These controls and application quotas are not a guaranteed spend cap.
5. Deploy Hosting plus the deny-direct-access Firestore and Storage rules. Test in a signed-out browser that one session cannot read or approve another's data.
6. Configure a scheduled Cloud Run Job using the same image with entry command `node apps/api/dist/cleanup.js`, private service identity and suitable environment. Run hourly. It revokes access before deleting expired/revoked-session recordings and incident documents and retries partial failures. Small revoked session markers remain to prevent token reuse from reopening the session; review retention of those markers before a real service launch.
7. Configure budget alerts, review logs for sensitive output, and run the live five-scenario evaluation before making claims in a demo video. Log only operational summaries; not recordings, transcripts, coordinates, or bearer tokens.

## Validation gate

Verify live analysis, original audio playback, denied microphone/location, server errors, stale edits, simultaneous approvals, session reset, cleanup execution, and desktop/mobile layout. Record the actual deployed URL and model/configuration after those checks. A built container or local health check is not proof of successful cloud deployment.

Official references checked during implementation: [Vertex AI audio sample](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/samples/googlegenaisdk-textgen-transcript-with-gcs-audio), [Google Gen AI request configuration](https://googleapis.github.io/js-genai/release_docs/interfaces/types.GenerateContentConfig.html), [Firebase Hosting](https://firebase.google.com/docs/hosting).
