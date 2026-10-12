# Local development

Use Node 22 (`.nvmrc`), Java 21+, FFmpeg, and ffprobe. `npm ci --registry=https://registry.npmjs.org` installs pinned dependencies without changing your global registry configuration. `npm run dev` starts the Firebase Auth/Firestore/Storage emulators, API, and Vite. It explicitly selects fixture mode and the nonproduction project `demo-emergency-copilot`.

The caller and responder are two views of one private demo session. Anonymous Firebase authentication gives the API a verified owner UID. Every report/audio/review endpoint checks ownership. Direct browser access to Firestore and Storage is denied. This shared-role demo is not production responder authorization.

Ports are configured in `firebase.json`, the API config, and Vite config. If a port is occupied, stop your own previous demo process or select a free port consistently. Do not terminate unrelated services. Use Ctrl+C in the `npm run dev` terminal to stop the suite; an abruptly terminated process can leave an emulator behind, so inspect the exact process before stopping it. The API cancels in-flight inference/uploads and drains route persistence before Firebase disposal. Browser tests now send SIGTERM with a ten-second grace period instead of immediately force-killing the web-server process group. See [disconnect and shutdown verification](technical-brief.md).

Audio is limited to 10 MiB and 60 seconds; FFmpeg normalizes supported uploads to mono 16 kHz WAV. Each model request has a 45-second deadline. Live conversation draft, consistency review and any single repair share a 90-second generation budget; the browser waits up to 105 seconds so it can receive the server's saved outcome. Fixture conversation generation is bounded to 45 seconds with a 60-second browser deadline. Conversation failures retain safe categories and finalized attempt metadata across retries; see [failure diagnostics](evaluation.md). Limits remain three attempts per turn, one active analysis per session, 30 analysis attempts per session per hour, and 100 globally per hour. Each session accepts up to 20 reports. Google may still charge an already-submitted live request after client cancellation; the prototype makes no hard cost-cap claim.

`npm test` covers schemas, media validation, provider failures, quotas and cleanup. `npm run test:integration` starts isolated local emulators for authenticated storage/transaction tests. Do not run it while the demo suite already occupies the ports. `npm run test:e2e` runs the browser acceptance flows against the actual app and emulators.

Code is formatted with `npm exec -- prettier --write <files>`. `.env`, credentials, generated logs, editor configuration, and test captures are excluded from Git. Do not record real incidents in this prototype.

Conversation turns use the same session ownership and expiry as incidents. See [conversation guide](conversations.md) for scripted branches, streaming recovery, and the live-model boundary.

Use **New incident** to open a fresh report, including when already on the intake page. **Reset report**, beside the report heading, clears the unsent text, recording/transcript and location, stops microphone capture and cancels pending transcription. Saved incident conversations remain available. **Reset session** removes the session's saved reports and starts over. A new conversation begins only after submitting a report or selecting a sample.

## Local app with live Gemini

`npm run dev` remains the offline scripted demo. `npm run dev:live` reads the ignored `.env.live` file and calls Gemini while Firebase Auth, Firestore and Storage remain in the `demo-emergency-copilot` emulators. Stop the existing demo before switching because both modes use the same local ports.

Set `GEMINI_PROJECT_ID` to your billing-enabled Google Cloud project, `GOOGLE_CLOUD_LOCATION` to a supported location, and `GEMINI_MODEL` to an available audio-capable model. The local launcher deliberately keeps the Firebase project and bucket separate from the inference project. No Firebase web configuration or cloud deployment is needed for this mode. Submitted text/audio is sent to Google for live inference; incident records remain local.

Authenticate using `gcloud auth login --update-adc --project=YOUR_PROJECT_ID`, enable `aiplatform.googleapis.com` in that project, and set the ADC quota project using `gcloud auth application-default set-quota-project YOUR_PROJECT_ID`. The signed-in account needs permission to use the API. Credentials stay in Google's local credential store, outside the repository. See [Google's setup guide](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/start/quickstart).

Choose the inference project, account and currently available audio-capable model in your ignored local configuration. Live inference sends submitted text/audio to Google and may incur usage charges. Record actual validation results privately; see [evaluation boundaries](evaluation.md).

## Optional Google Maps picker

Set `VITE_GOOGLE_MAPS_API_KEY` in the ignored `.env.live` for `npm run dev:live`, or in the build environment for a deployment. Enable Maps JavaScript API (`maps-backend.googleapis.com`) and Geocoding API (`geocoding-backend.googleapis.com`) in the chosen billing-enabled project. Use a dedicated browser key restricted to those two APIs and the exact application website referrers. For the local prototype, allowed referrers are `http://127.0.0.1:5173/*` and `http://localhost:5173/*`. Add an approved deployment origin before deploying; do not remove restrictions. Browser keys are delivered to the browser by design; never place service-account credentials in Vite environment variables.

The picker loads only when opened, and address searches occur only after **Search address**. Google Maps usage is billed to the key's project. The location query/coordinates go to Google Maps; the incident narrative does not. Without a key, the form supports manual location entry and an external Google Maps link, and review submission still works. Google documentation: [API key setup](https://developers.google.com/maps/documentation/javascript/get-api-key), [click coordinates](https://developers.google.com/maps/documentation/javascript/examples/event-click-latlng), [geocoding](https://developers.google.com/maps/documentation/javascript/geocoding).
