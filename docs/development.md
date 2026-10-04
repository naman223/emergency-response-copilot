# Local development

Use Node 22 (`.nvmrc`), Java 21+, FFmpeg, and ffprobe. `npm ci --registry=https://registry.npmjs.org` installs pinned dependencies without changing your global registry configuration. `npm run dev` starts the Firebase Auth/Firestore/Storage emulators, API, and Vite. It explicitly selects fixture mode and the nonproduction project `demo-emergency-copilot`.

The caller and responder are two views of one private demo session. Anonymous Firebase authentication gives the API a verified owner UID. Every report/audio/review endpoint checks ownership. Direct browser access to Firestore and Storage is denied. This shared-role demo is not production responder authorization.

Ports are configured in `firebase.json`, the API config, and Vite config. If a port is occupied, stop your own previous demo process or select a free port consistently. Do not terminate unrelated services. Use Ctrl+C in the `npm run dev` terminal to stop the suite; an abruptly terminated process can leave an emulator behind, so inspect the exact process before stopping it.

Audio is limited to 10 MiB and 60 seconds; FFmpeg normalizes supported uploads to mono 16 kHz WAV. Inference has a 45-second client deadline, three attempts per incident, one active analysis per session, 30 analysis attempts per session per hour, and 100 globally per hour. Each session accepts up to 20 reports. Google may still charge an already-submitted live request after client cancellation; the prototype makes no hard cost-cap claim.

`npm test` covers schemas, media validation, provider failures, quotas and cleanup. `npm run test:integration` starts isolated local emulators for authenticated storage/transaction tests. Do not run it while the demo suite already occupies the ports. `npm run test:e2e` runs the browser acceptance flows against the actual app and emulators.

Code is formatted with `npm exec -- prettier --write <files>`. `.env`, credentials, generated logs, editor configuration, and test captures are excluded from Git. Do not record real incidents in this prototype.

Conversation turns use the same session ownership and expiry as incidents. See [conversation guide](conversations.md) for scripted branches, streaming recovery, and the live-model boundary.

## Local app with live Gemini

`npm run dev` remains the offline scripted demo. `npm run dev:live` reads the ignored `.env.live` file and calls Gemini while Firebase Auth, Firestore and Storage remain in the `demo-emergency-copilot` emulators. Stop the existing demo before switching because both modes use the same local ports.

Set `GEMINI_PROJECT_ID` to your billing-enabled Google Cloud project, `GOOGLE_CLOUD_LOCATION` to a supported location, and `GEMINI_MODEL` to an available audio-capable model. The local launcher deliberately keeps the Firebase project and bucket separate from the inference project. No Firebase web configuration or cloud deployment is needed for this mode. Submitted text/audio is sent to Google for live inference; incident records remain local.

Authenticate using `gcloud auth login --update-adc --project=YOUR_PROJECT_ID`, enable `aiplatform.googleapis.com` in that project, and set the ADC quota project using `gcloud auth application-default set-quota-project YOUR_PROJECT_ID`. The signed-in account needs permission to use the API. Credentials stay in Google's local credential store, outside the repository. See [Google's setup guide](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/start/quickstart).

Gemini 3.5 Flash is the initial configured model for this project's local setup. Google documents audio input and the global endpoint for it in the [model reference](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-flash). Actual project access and application response quality must still be verified after authentication and billing are ready. Configuration and successful builds alone do not establish live inference success.
