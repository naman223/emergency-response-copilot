# Emergency Response Copilot

An emergency intake prototype for **Sustainability & Social Impact** in Google Cloud AI Builder Cup 2026. Short voice reports become evidence-linked incident briefs for a human reviewer. Every dispatch is simulated; this application does not contact emergency services.

## Run locally

Requirements: Node.js 22.12+ (tested with 22.23.2), Java 21+ for Firebase emulators, FFmpeg and ffprobe on PATH. The first run downloads the emulator binaries. Google Cloud credentials and billing are **not needed** for local fixture mode.

```sh
npm ci --registry=https://registry.npmjs.org
npm run dev
```

Open **http://127.0.0.1:5173**. Click **Start demo session**, then **Start conversation** on a sample card. You are the security officer; the AI coordinator acknowledges the recording and asks a follow-up. Choose a suggested answer, reply **Unknown**, or correct the location. Open **Review and decide**, save your human review, enter a reason and approve the simulation. Reset deletes your demo reports. Stopping the emulator suite clears local emulator state.

Local ports: web 5173, API 8181, Auth emulator 9099, Firestore 8180, Storage 9199. Development listens on loopback. This URL works on the computer running the application; it is not a public judging URL.

## What works

- Conversation-first officer workspace: five fictional scenarios, text reports, recording/upload, optional device location and private original audio.
- Streamed coordinator replies, targeted clarifications, suggested answers, location corrections, and a context panel showing sourced facts, unknowns and suggested routing.
- Human review remains separate: new context preserves saved edits but requires rechecking before approval.
- Session ownership checks for data, audio, edits and approvals; private Firestore/Storage rules.
- Transactional revision checks and idempotent simulated dispatch.
- Validation of media size/type/duration; bounded processing, retries and request quotas; failed analysis preserves the recording for manual review.
- Session reset and expiration enforcement, plus a cleanup job entry point.
- A Vertex AI Gemini adapter and Cloud Run container configuration for later cloud setup.

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

## Project layout

- `apps/web`: React/TypeScript interface.
- `apps/api`: Fastify API, Firebase persistence, analysis providers and human decision workflow.
- `packages/contracts`: strict schemas shared by browser and backend.
- `fixtures`: fictional synthesized recordings and independently written expected results.
- `docs`: approved design, implementation plan, local development, evaluation, and later deployment guidance.

See [sample conversation guide](docs/conversations.md), [implementation status](docs/implementation-status.md), [development](docs/development.md), [judge walkthrough](docs/judging-guide.md), [evaluation](docs/evaluation.md), and [cloud setup](docs/deployment.md).

## Current boundary

The current deliverable is the local prototype. Live Gemini evaluation and Google Cloud deployment await a user-selected project. No real dispatch integrations, medical advice, calibrated emergency probabilities, or production emergency-response claims are included. Public competition submission and final PDF/video publication remain later steps.
