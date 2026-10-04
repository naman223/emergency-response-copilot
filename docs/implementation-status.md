# Local milestone — 2026-10-04

## Live connection update — 2026-10-04

The user-selected billing-enabled project is now authenticated for local Gemini inference. The Vertex AI API was already enabled. The app runs with `npm run dev:live`; Firebase Auth, Firestore and Storage remain emulated, and no public deployment was made.

Gemini 3.5 Flash streamed a fictional free-form text report, accepted a location/status correction, and transcribed a fictional caller recording. The first audio check exposed caller/officer confusion and incorrect evidence attribution; an explicit recording-provenance instruction corrected the repeated sample, whose facts matched transcript quotes. A real Chrome walkthrough then verified custom text, a correction, human-review access and conversation persistence after reload. The live-mode screen was visually inspected. These are small connectivity and behavior checks, not a representative safety or accuracy evaluation.

After the live prompt and mode-label changes: 53 unit tests, typecheck and production builds pass. The earlier 11 emulator and 12 scripted-browser results below belong to the preceding milestone; they were not rerun as live tests. The local settings file is ignored by Git and credentials remain outside the repository. Starting with plain `npm run dev` still uses scripted mode.

The sections below retain the earlier local milestone record; statements that live inference was unverified describe that earlier state.

User scope: build locally first; the Google Cloud project will be supplied later.

## Delivered

- Shared strict contracts; authenticated intake and private original audio; separate location provenance.
- Explicit prepared-fixture provider and a configurable Vertex AI Gemini adapter. Live inference is unverified.
- Transactional human edits, reasons, history, revision conflicts, idempotent approvals and simulated receipts.
- Responsive caller/responder interface, recording/upload, sample scenarios, permission fallbacks and session reset.
- Bounded audio validation, analysis deadline/leases, attempt and hourly quotas, expiry and cleanup entry point.
- Local Firebase emulator startup, production bundles, container configuration, judge walkthrough and submission drafts.

The local milestone is functional; the original plan's cloud and submission steps remain open. Caller and responder share an isolated anonymous demo session, not real responder roles.

## Independent review disposition

One independent final review was followed by one correction pass:

- Interrupted processing: reproduced in service and browser tests. Reading an expired processing lease now recovers the incident to failed/manual-review state without releasing a newer worker's lease, including after the third attempt.
- Microphone lifecycle: reproduced late permission and duplicate permission requests. The component now releases late grants after unmount, prevents overlapping acquisition, and cleans up recorder initialization failures.
- Reviewed report visibility: reproduced lost visibility after approval. Final human summary, routing, urgency, location and approved revision remain visible after reload; original analysis stays separately labeled.
- Suspected WebM rejection: did not reproduce with real Chrome MediaRecorder capture or nonseekable FFmpeg WebM output. The current file-based ffprobe validation accepted these recordings and rejected 61-second audio. Retained browser and media coverage; no speculative media change was applied. Other browser/codec combinations are unverified.

## Validation

All checks below completed successfully against the final implementation:

| Check                                      | Result                                             |
| ------------------------------------------ | -------------------------------------------------- |
| `npm test`                                 | 49 unit tests passed                               |
| `npm run test:integration`                 | 11 authenticated emulator integration tests passed |
| `npm run test:e2e`                         | 12 Chrome browser tests passed                     |
| `npm run typecheck`                        | Passed                                             |
| `npm run build`                            | Frontend and API production bundles built          |
| `node --import tsx scripts/smoke-build.ts` | Built API health passed                            |
| Docker build and loopback container health | Passed; temporary container stopped                |

Synthetic fixtures validate wiring, not model accuracy. Desktop and 390-pixel mobile screens were visually inspected. The real Chrome recording test uses Chrome's synthetic microphone device and exercises MediaRecorder/upload/manual review; it does not test a physical microphone or live Gemini. No cloud services were invoked by the container health check.

## Remaining work

- User-selected project, billing, appropriate region/model, Firebase web configuration, service identities and IAM.
- Live Gemini evaluation and prompt/quality assessment on a broader representative dataset.
- Cloud deployment, hosting URL, scheduled cleanup execution, signed-out access checks and operational review.
- Public repository/submission links and final PDF/video. Draft outlines are present only.
- Dependency follow-up: the production npm audit reports zero high/critical and two moderate transitive advisories (`gaxios`/`uuid` via Google Cloud Storage). Reassess dependency updates before a public deployment; no forced incompatible upgrade was applied. The development tooling also has upstream advisories. Local emulator runs emit upstream Java deprecation and SDK listener/metadata warnings; checks still pass.

## Conversational upgrade — 2026-10-04

The approved conversational design replaces the role-switching form workflow with an officer/coordinator chat, streaming updates, targeted scripted clarifications and corrections, an incident context panel, and separately saved human review. The final card now has readable labels and consistent spacing. Original audio, transcript and human edits remain preserved. New context requires rechecking the saved review before approval.

Conversation contract, service, provider, stream, review, real-emulator and browser checks are included. Live Gemini remains unverified; see [conversation guide](conversations.md). The final checks above include the conversational upgrade. One independent review of `f86af45..dfc4d23` was followed by one correction pass:

- Current scripted facts now supersede prior answers. Unknown removes the prior active answer, contradictory updates do not accumulate as current facts, and supported answers work out of question order. Location corrections preserve injury/status details and refresh the narrative. Explanation requests retain only the current pending question.
- Failed older turns cannot be retried after a newer message. The API returns `TURN_SUPERSEDED`, and the UI directs the officer to continue from the latest message.
- HTTP disconnect aborts unfinished provider work and promptly persists an interrupted turn while releasing the session lease. A real HTTP/emulator regression verifies this before the provider deadline. Test cleanup explicitly closes client keep-alive sockets.
- Browser coverage confirms new context preserves saved human wording and requires a new review save before approval.

Regression failures were reproduced before the fixes; all 49 unit, 11 emulator integration and 12 Chrome tests now pass. Typecheck, production bundles, built API health, container build and in-container loopback health pass. Desktop conversation, final approved report and mobile layout were visually inspected. The verified local preview is `http://127.0.0.1:5173`.

Review scope rulings: live Gemini/model quality, cloud deployment and real emergency suitability remain outside this local demonstration milestone. No Git push or deployment was performed.
