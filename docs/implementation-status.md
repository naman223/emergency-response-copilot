# Local implementation status

## Combined review approval — 2026-10-05

The primary action is now **Approve & simulate dispatch**. It submits the current review, including unsaved summary and service edits, and atomically saves and approves it in one request. **Save draft** replaces **Send review** as an optional secondary action. SMS previews remain visible before approval. A failed validation or conflicting revision leaves the incident unchanged; repeated requests reuse the same receipt. Separate save and approval audit entries retain the approved review version. Existing saved-review API clients remain supported.

Validation: 80 unit tests, all 29 Chrome browser tests, 12 authenticated Firebase integration tests, typecheck and production builds passed. New tests verify unsaved edits reach the receipt without a separate save request, failed approval leaves no partial save, stale revisions cannot overwrite another review, and concurrent retries create only one approval and notification set. The 390-pixel mobile action row was visually checked and a one-click approval completed. Focused independent review found no important issues. No real notifications, deployment or Git push were performed.

## Multiple service notifications and SMS recipient view — 2026-10-05

Human review now offers independent Police, Medical, Fire and Emergency checkboxes. AI service indicators preselect recipients, with ambulance need selecting Medical and unknown needs remaining unselected; older primary routing remains a fallback. Human changes survive later assessment updates and reloads. Approval requires at least one effective recipient, including for legacy drafts. The backend normalizes primary routing for the existing Maps handoff.

Each selected service has an SMS preview containing reviewed urgency, location and verification status, optional map coordinates, a short incident summary and a details link. Approval atomically records one explicitly simulated message per service, with idempotent retries returning the same receipt. **SMS sent (simulation)** appears only after approval. No SMS provider or actual emergency-service contact was added.

The service recipient demo opens in a separate tab and shows the received simulated message, reviewed incident, original report/transcript, assessment and full clarification answers. Links require the original authenticated demo session; another session sees an unavailable notification without incident details. These are local demo links, not public links for actual responders.

Validation: 76 unit tests, all 28 Chrome browser cases, 11 authenticated emulator integration tests, typecheck and frontend/API production builds passed. The independent review's zero-recipient legacy approval finding was reproduced and fixed with a regression test. Two older unclear-report walkthroughs now explicitly choose a recipient; the recording regression waits for real audio frames before stopping, avoiding a headers-only capture. The live Gemini walkthrough preselected Police, Medical and Emergency for a fictional injured-worker report, accepted a clarification, recorded four simulated notifications after a manual Fire selection, and opened a Medical recipient link containing the clarification. Reload persistence and 390-pixel mobile fit passed. Desktop service selections, SMS cards and recipient view were visually inspected. This validates the prototype workflow, not emergency-response accuracy.

The local live preview remains at `http://127.0.0.1:5173`. No real SMS, public deployment or Git push was performed.

## Essential clarification and incident indicators — 2026-10-05

Urgency no longer ends intake by itself. The urgent recommendation remains visible while the coordinator asks for missing essentials, accepts unknown answers and retains the five-question target and ten-question ceiling. Manual completion is still available. The current question is pinned in the intake banner so the incident report below the conversation cannot hide it.

The incident report now shows emergency, police response, medical support, ambulance, fire response, weapon, injuries and current immediate danger, each with Yes/No/Unknown and a short model-provided reason. Summary, urgency, responder and reported location remain visible. The report updates with clarification, appears in human review and the approved incident, and survives reload. Older assessments without indicators display Unknown. These are AI suggestions distinct from the human decision.

Live testing found truncated JSON when the prior 4,096-token allowance was exhausted and a subsequent turn that hit the 45-second deadline. The model now has an 8,192-token allowance and Gemini 3 uses LOW thinking for short intake turns. Original-transcript output is offered only when original audio is attached. Temporary diagnostics were removed; deadlines, context limits and review safeguards remain enforced.

Validation: 70 unit tests, 11 emulator integration tests, typecheck and production builds passed. The browser suite passed 25 of 26 cases; a mistaken test-only manual-finish step in an already completed conversation was removed, after which all four quick-review cases passed. A final targeted run passed the incident-report/current-question and mobile-composer cases. All 26 browser cases are covered across these runs. With the final live settings, both user-provided fictional Bengaluru reports asked clarification and completed after four clarification answers, accepting Unknown without an endless loop. The walkthrough checked indicator updates, approval/reload persistence and mobile fit; desktop/mobile screens were inspected. These limited workflow checks do not establish emergency-response accuracy. The local live app remains at `http://127.0.0.1:5173`; no public deployment or Git push was made.

## Prefilled review, clarification history and map selection — 2026-10-05

Human review opens with all known incident details prefilled and a default review reason. **Send review** saves without requiring new text; **Approve simulation** remains a separate decision. Untouched fields refresh as clarification arrives, while manual edits are preserved. Unknown values remain unknown. The original report and full clarification answers remain part of the incident, including after approval and reload. Answers are persisted before inference starts and invalidate an older review even if processing is interrupted. Initial reported location is now passed explicitly to Gemini.

The optional Google Maps picker supports address search and clicking a point, followed by explicit location confirmation. A selected incident point is stored separately from device GPS. Manual location changes clear the previous map selection and destination. A dedicated localhost-restricted Maps key is configured in the ignored local environment; no credentials were committed. Nearby-service lookup remains a human-selected simulated handoff.

Validation: all 68 unit tests, 25 browser tests, 11 emulator integration tests, typecheck and production builds passed. A live Gemini and real Google Maps walkthrough verified reported-location propagation, prefilled submission without typing, address search, map-click coordinates, separate location provenance, and clarification retention after approval/reload. Mobile layout fits a 390-pixel viewport. These checks establish connectivity and workflow behavior, not emergency-response accuracy.

One independent review found a whitespace-normalization mismatch that kept approval disabled after saving and a map search state that remained busy after closing/reopening. Both were reproduced, fixed and covered by regression tests. The live local preview remains available at `http://127.0.0.1:5173`; no public deployment or Git push was made.

## Recording preview and reported location — 2026-10-05

Stopping or uploading a recording in live mode now requests an editable Gemini transcript before the conversation starts. An explicit incident location copied from the transcript can populate an empty location field. Typed or corrected reports also have **Suggest location from report**. Existing manual text/location edits are preserved while a preview is in flight; stale or cancelled responses cannot replace the current draft. The original audio remains attached when the transcript is edited, and explicit **Start conversation** saves both. The coordinator is instructed to distinguish the original recording from reviewed officer text. A failed preview offers retry/manual entry without discarding the recording.

The authenticated preview endpoint creates no incident and persists no audio; it validates media, shares session/global inference quotas, enforces a deadline, and releases its session lease after completion, failure or cancellation. Suggested locations remain unverified descriptions, separate from GPS. The upload metadata limit now accommodates the existing 2,000-character report limit in multibyte languages as well as English.

Validation: 65 unit tests, 11 emulator integration tests, typecheck and production builds passed. The browser run passed 19 of its 20 cases; the remaining microphone-cleanup case depended on starting a sample while microphone permission was pending, which is now intentionally disabled. It passed after being updated to leave intake through session reset. One additional browser regression passed for correct retry behavior after a typed-location lookup fails. Thus 21 browser cases are covered across the full run and targeted reruns. Preview browser tests use controlled model responses; a separate live Gemini walkthrough used real Chrome MediaRecorder with a fictional audio file as the microphone source. It verified transcription, a North Gate location suggestion, typed correction/location extraction, original audio plus edited-text submission, an actual coordinator reply, and no incident creation before explicit start. Desktop and mobile layouts were inspected. Physical microphones, other browsers and broader transcription accuracy remain untested.

One independent review found no Critical/Important issues. Its minor retry-label finding was reproduced and fixed: failure of a text-location request no longer offers to retranscribe an attached recording. The local app remains in live Gemini mode; no public deployment was made.

## Bounded intake and handoff — 2026-10-05

Approved intake now targets five essential questions, permits critical-gap clarification up to a server-enforced ceiling of ten, and ends earlier for urgent or sufficiently complete assessments. Officers can choose **Finish assessment now**. Persisted **Assessment ready** status prevents later updates or reloads from restarting the questionnaire; the brief retains unknown information and suggested urgency/routing for human review.

Verified incident locations enable a Google Maps search for nearby services of the reviewed responder type. The reviewer chooses and records a service name for the existing human-approved simulated handoff. This is an external real-listings search, not automated nearest-facility selection or service availability verification. No emergency service is contacted.

One independent review identified two issues, both corrected: raw model follow-up text could appear before the stopping rule discarded it, and removing location confirmation could strand a selected destination. Reply text is now buffered until validation and intake policy acceptance, while progress events continue to stream; removing confirmation clears the destination. Regression checks cover both fixes.

Validation: 58 unit tests, 11 emulator integration tests, typecheck and frontend/API production builds passed. The browser suite passed 13 cases; its remaining recovery case used an obsolete urgent-sample clarification expectation and passed on a targeted rerun after switching to an ambiguous sample. All 14 browser cases are therefore covered across those two runs. A separate live Gemini Chrome check verified manual completion, a later location update without renewed clarification, the confirmed-location Maps handoff, and the mobile composer. Desktop and 390-pixel mobile screens were inspected. These limited live checks verify connectivity and workflow behavior, not emergency-response accuracy. The local live preview remains at `http://127.0.0.1:5173`; no public deployment was made.

The following sections retain earlier milestone results and boundaries.

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
