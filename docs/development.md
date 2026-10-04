# Local development

Use Node 22 (`.nvmrc`), Java 21+, FFmpeg, and ffprobe. `npm ci --registry=https://registry.npmjs.org` installs pinned dependencies without changing your global registry configuration. `npm run dev` starts the Firebase Auth/Firestore/Storage emulators, API, and Vite. It explicitly selects fixture mode and the nonproduction project `demo-emergency-copilot`.

The caller and responder are two views of one private demo session. Anonymous Firebase authentication gives the API a verified owner UID. Every report/audio/review endpoint checks ownership. Direct browser access to Firestore and Storage is denied. This shared-role demo is not production responder authorization.

Ports are configured in `firebase.json`, the API config, and Vite config. If a port is occupied, stop your own previous demo process or select a free port consistently. Do not terminate unrelated services. Use Ctrl+C in the `npm run dev` terminal to stop the suite; an abruptly terminated process can leave an emulator behind, so inspect the exact process before stopping it.

Audio is limited to 10 MiB and 60 seconds; FFmpeg normalizes supported uploads to mono 16 kHz WAV. Inference has a 45-second client deadline, three attempts per incident, one active analysis per session, 30 analysis attempts per session per hour, and 100 globally per hour. Each session accepts up to 20 reports. Google may still charge an already-submitted live request after client cancellation; the prototype makes no hard cost-cap claim.

`npm test` covers schemas, media validation, provider failures, quotas and cleanup. `npm run test:integration` starts isolated local emulators for authenticated storage/transaction tests. Do not run it while the demo suite already occupies the ports. `npm run test:e2e` runs the browser acceptance flows against the actual app and emulators.

Code is formatted with `npm exec -- prettier --write <files>`. `.env`, credentials, generated logs, editor configuration, and test captures are excluded from Git. Do not record real incidents in this prototype.
