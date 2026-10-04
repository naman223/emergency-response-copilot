# Emergency Response Copilot — proposed MVP design

Status: Approved by the user on 2026-10-04. No application code or cloud resources created at approval.

## Purpose and success

Build a fresh Google Cloud AI Builder Cup prototype under Sustainability & Social Impact. Turn a short voice report into an evidence-linked incident brief that a human can review, correct, and approve for simulated dispatch.

The first milestone succeeds when a tester can submit sample audio, obtain a real Gemini-generated brief, inspect its supporting evidence, edit it, and approve one simulated dispatch. Another tester's incidents must remain inaccessible. Model failure must leave the original incident available for manual review.

Confirmed requirements: local development in this repository, GitHub source control, eventual Google Cloud deployment, human review before mock dispatch, and a browser-accessible judging experience.

Proposed defaults: a responsive web application, English-first validation, short recordings rather than live voice conversations, and a simulated campus/community response desk as the initial operator. Additional languages follow after the first complete workflow is verified.

## Implementation options

1. Recommended: React/TypeScript frontend and Node.js/TypeScript API in one repository. Firebase Hosting serves the frontend; Cloud Run runs the API; Gemini is accessed through Vertex AI. One language and shared validation schemas keep the first build small.
2. React frontend and Python/FastAPI backend. A sound alternative if Python-specific audio processing becomes central, with two language toolchains to maintain.
3. Live conversational voice intake from the outset. Supports interactive clarification, but introduces streaming, interruption, and session management before the basic reviewer workflow has been validated. Defer it.

## User experience

### Caller view

- Begin an isolated demo session.
- Choose a fictional sample recording or record/upload a short audio clip, initially limited to 60 seconds.
- Optionally provide device location with permission or enter a location description. Sample coordinates are visibly labeled simulated.
- Submit and see receipt plus processing state. Do not imply that help has been dispatched.

### Responder view

- See incidents belonging to the current demo session.
- Replay the original recording and inspect a draft transcript and incident brief.
- Distinguish caller-reported facts, AI suggestions, missing information, and human-confirmed fields.
- Review suggested urgency and routing, correct fields, and record a decision.
- Approve simulated dispatch, keep the incident pending for clarification, or close it with a reason.
- See the decision history and simulated dispatch receipt.

Demo mode lets one tester exercise both roles only inside their isolated session. This is not production responder authorization. Every view clearly labels the system as a prototype with simulated dispatch.

## Architecture and repository

Proposed directories:

- `apps/web`: React, TypeScript, Vite, and the two browser views.
- `apps/api`: Node.js/TypeScript HTTP API and simulator.
- `packages/contracts`: shared request, response, and model-output validation schemas.
- `fixtures`: fictional recordings and expected evidence for repeatable evaluation.
- `docs`: design, local setup, deployment, and testing guide.

Request path:

Browser -> authenticated API -> pending incident and private audio storage -> Gemini analysis -> validated brief -> responder review -> authenticated decision endpoint -> mock dispatch.

Local development uses Firebase Auth, Firestore, and Storage emulators plus the local API. Real analysis uses a configured Google Cloud project and Vertex AI credentials. A deterministic fixture provider supports development before credentials are available; its outputs must be visibly labeled fixture results and must never silently replace failed live inference.

Cloud deployment uses Firebase Hosting, Cloud Run, Vertex AI, Firestore, Cloud Storage, and Firebase Authentication. Use service identity in Cloud Run and local application-default credentials for development. Commit no credentials. No Pub/Sub or multiple AI agents in the first milestone.

The browser reads and changes incidents through the API. Initial updates use bounded polling; a realtime listener can be added if needed. Firestore and audio storage do not grant public data access.

## AI contract

Use one bounded analysis request for each submitted recording. Return a draft transcript, reported facts, evidence references, unknowns, suggested urgency, suggested routing, and a concise explanation.

Do not show model-generated emergency or threat percentages as measured probabilities. Extracted claims are not verified facts. Distressed tone is not required for urgent review, and tone alone must not determine the suggestion.

Location coordinates, accuracy, and capture time come from the device or explicitly labeled sample metadata, never model invention. Spoken location descriptions remain caller-reported.

Validate output structure, evidence references, and permitted enum values in code. A reference that cannot be verified against the available transcript must be marked unverified or omitted. Transcript agreement does not prove agreement with the audio; replay remains available to the reviewer. Do not promise word-level timestamps until the selected model's output is tested.

Treat instructions inside uploaded audio as report content, never as instructions to change authorization or invoke dispatch. Model output has no permission to dispatch.

## State and decisions

Use separate state dimensions:

- Analysis: pending, processing, ready, failed.
- Review: pending, needs clarification, approved, closed.
- Simulation: not started, completed, failed.

Persist the incident before inference. Failed analysis allows retry or manual completion. Only a server-validated human decision can approve an incident. Approval records the exact reviewed revision, reviewer identity, edits, reason, and time. Reject stale approvals if that revision changed.

Dispatch simulation uses an idempotency key and a transactional state transition so repeated clicks cannot create duplicate simulated dispatches. Closing an incident records a reason; it never silently deletes the report.

## Demo access and operational limits

Provide an HTTPS landing page with a Try the demo action and a signed session. Each session gets isolated data, a short test guide, and a reset action. Validate ownership at every API endpoint, including audio playback and decisions.

Validate upload size, duration, and supported media formats. Bound inference concurrency, retries, and per-session requests. Configure a short demo-data retention period and an explicit reset/delete path before public deployment. Use fictional sample data; logs must not contain audio, full transcripts, location coordinates, credentials, or tokens.

Gemini errors show a clear processing failure with the original recording still accessible. No fallback may pretend to be a successful live model call.

## Verification and delivery

Use focused tests for contract validation, session isolation, stale approvals, duplicate approvals, and model failure. Run browser checks for the complete happy path, microphone/location denial, manual correction, and failed analysis.

Evaluate fictional recordings covering an explicit threat, calm speech reporting danger, a benign weapon mention, ambiguous/noisy audio, and missing location. Report extraction mistakes and latency honestly; these examples are not evidence of production emergency-response accuracy.

Delivery milestones:

1. Local caller/responder workflow using clearly labeled fixture analysis.
2. Real Gemini integration and evaluation of the same workflow.
3. Early deployment to Google Cloud and signed-out browser/mobile validation.
4. Polish evidence review, test failure paths, prepare public repository, PDF deck, and demo video under three minutes.

Deployment requires a user-selected Google Cloud project, access to the chosen model, and billing/API setup. Actual model identifiers and SDK versions will be verified against official documentation during implementation.

## Outside the first build

Real emergency-service integration, automatic dispatch, continuous/background listening, autonomous calls, live conversational intake, clinical advice, and claims of calibrated emergency detection accuracy.
