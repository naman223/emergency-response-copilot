# Emergency Response Copilot

An emergency intake prototype for **Sustainability & Social Impact** in Google Cloud AI Builder Cup 2026. Short voice reports become evidence-linked incident briefs for a human reviewer. Every dispatch is simulated; this application does not contact emergency services.

Hosted-demo access is supplied separately with the competition submission. Deployment addresses, account identifiers and operational records are intentionally excluded from this repository. See [deployment guidance](docs/deployment.md) and [publication hygiene](docs/publication-hygiene.md).

## Run locally

Requirements: Node.js 22.12+ (tested with 22.23.2), Java 21+ for Firebase emulators, FFmpeg and ffprobe on PATH. The first run downloads the emulator binaries. Google Cloud credentials and billing are **not needed** for local fixture mode.

```sh
npm ci --registry=https://registry.npmjs.org
npm run dev
```

Open **http://127.0.0.1:5173**. Click **Start demo session**, then **Start conversation** on a sample card. You are the security officer; the coordinator acknowledges the recording and asks a follow-up. Choose a suggested answer, reply **Unknown**, or correct the location. Open **Review and decide**, check the prefilled details and selected services, then choose **Approve & simulate dispatch**. This saves and approves together; **Save draft** is optional. Reset deletes your demo reports. Stopping the emulator suite clears local emulator state.

For free-form Gemini conversations locally, use `npm run dev:live` with the configured ignored `.env.live` and local Google credentials. Firebase data remains in local emulators; Gemini inference uses your privately configured Google Cloud project. See [live setup](docs/development.md#local-app-with-live-gemini). The UI labels the active mode. Fixture mode does not interpret arbitrary text/audio with AI.

Local ports: web 5173, API 8181, Auth emulator 9099, Firestore 8180, Storage 9199. Development listens on loopback. This URL works on the computer running the application; it is not a public judging URL.

## What works

- Conversation-first officer workspace: five fictional scenarios, text reports, recording/upload, optional device location and private original audio.
- Streamed progress states, validated coordinator replies, targeted clarifications, suggested answers, location corrections, and a context panel showing sourced facts, unknowns and suggested routing. Live reply text arrives after source/consistency checks; private model reasoning is not displayed.
- Human review remains separate: new context preserves saved edits but requires rechecking before approval.
- Session ownership checks for data, audio, edits and approvals; private Firestore/Storage rules.
- Transactional revision checks and idempotent simulated dispatch.
- Police, Medical, Fire and Emergency selections prefilled from the AI assessment, with a per-service SMS preview and simulated outbox after human approval.
- Authenticated recipient demo links showing the reviewed incident, original report and clarification history.
- Validation of media size/type/duration; bounded processing, retries and request quotas; failed analysis preserves the recording for manual review.
- Session reset and expiration enforcement, with a verified hourly cloud cleanup job.
- Live Vertex AI Gemini integration, with Cloud Run and Firebase Hosting deployment support.

**Scripted sample mode is explicit:** the five provided samples use prepared conversation branches. They exercise the entire application, storage and approval path, but do not call Gemini. Personal text/audio reports can be saved and reviewed manually. Unsupported free-form sample messages are saved and get an honest limitation response. Scripted playback is not live Gemini output. The app never silently replaces a failed live analysis with a prepared result.

## Checks

```sh
npm test
npm run typecheck
npm run build
npm run test:integration
npm run test:e2e
npm run evaluate -- --mode fixture
```

Stop `npm run dev` before the integration command so it can start its own emulators. Browser tests reuse a running development server or start one automatically. They use installed Google Chrome; change `channel` in `playwright.config.ts` if using a Playwright-managed Chromium installation.

`node --import tsx scripts/smoke-build.ts` starts the built API on 8182 and checks health. It validates bundle startup, not live cloud connectivity.

For the Cloud Run API image, with Docker running, use `npm run container:build` followed by `npm run container:check`. The image targets Linux amd64 and the checker removes its own containers. See [container validation and image findings](docs/container-deployment.md); Firebase Hosting serves the frontend separately.

For the component inventory, architecture and report lifecycle, see the [technical brief](docs/technical-brief.md).

## Project layout

- `apps/web`: React/TypeScript interface.
- `apps/api`: Fastify API, Firebase persistence, analysis providers and human decision workflow.
- `packages/contracts`: strict schemas shared by browser and backend.
- `fixtures`: fictional synthesized recordings and independently written expected results.
- `docs`: approved design, implementation plan, local development, evaluation, and later deployment guidance.

See [sample conversation guide](docs/conversations.md), [implementation status](docs/implementation-status.md), [development](docs/development.md), [judge walkthrough](docs/judging-guide.md), [evaluation](docs/evaluation.md), and [cloud setup](docs/deployment.md).

See [evaluation boundaries](docs/evaluation.md) for synthetic voice coverage and the physical microphone/language validation checklist.

## Current boundary

The current deliverable is a local and hosted competition prototype with live Gemini. Limited synthetic voice, correction and hosted workflow evaluation is recorded; real-speaker testing, broader model evaluation and unresolved image findings need further work before a production launch. SMS notifications and dispatch are simulated; recipient links require the original authenticated demo session. No real emergency-service integration, medical advice, calibrated emergency probabilities, or production emergency-response claims are included. Public competition submission and final PDF/video publication remain later steps.
