# Emergency Response Copilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task, according to the user's execution choice. Steps use checkbox syntax for tracking.

**Goal:** Deliver a locally testable voice-to-incident workflow, real Gemini analysis, and a Google Cloud demo that judges can exercise through a browser.

**Architecture:** A React browser application calls a TypeScript HTTP API; the API owns authentication checks, private data access, inference, and approval transactions. Firebase emulators support local development; Cloud Run, Firebase Hosting, Vertex AI, Firestore, and Cloud Storage support deployment. Use explicit fixture and live providers, with no silent fallback.

**Tech Stack:** npm workspaces, TypeScript, React/Vite, Node.js LTS, Fastify, Zod, Firebase client/Admin SDKs, Google Gen AI SDK, Vitest, Playwright, and FFmpeg/ffprobe for bounded audio validation/normalization. At execution, verify compatible supported versions and Vertex AI audio/structured-output capabilities against official documentation, pin dependencies in the lockfile, and record the tested runtime in `.nvmrc` and `package.json`.

**Spec:** `docs/superpowers/specs/2026-10-04-emergency-response-copilot-design.md` (approved).

## Global Constraints

- Short audio clips are initially limited to 60 seconds.
- English-first validation; simulated campus/community response desk.
- Every view clearly labels the system as a prototype with simulated dispatch.
- Do not show model-generated emergency or threat percentages as measured probabilities.
- Model output has no permission to dispatch.
- No Pub/Sub or multiple AI agents in the first milestone.
- Firestore and audio storage do not grant public data access.
- Commit no credentials.
- Actual model identifiers and SDK versions will be verified against official documentation during implementation.
- Public submission includes a deployed link, public GitHub repository, PDF deck, and demo video under three minutes; prepare artifacts, never claim their creation or publication before it happens.

## Review Focus

- Cross-session access by guessed incident ID, audio URL, or approval request must return no other session's data (Task 2).
- Duplicate requests and approval after an edit must produce one receipt or a revision conflict, never two dispatches (Task 4).
- Truncated, mislabeled, oversized, or overlong audio must be rejected before inference; denied device permissions must leave sample input usable (Tasks 2 and 5).
- Provider timeout, invalid output, or restarted processing must preserve the incident, permit bounded retry, and never masquerade as fixture success (Task 3).
- Prompt instructions or unsupported location claims within audio/model output must not alter permissions, invoke dispatch, or populate device-location fields (Tasks 1 and 3).

## File Map

- Root: `package.json`, `package-lock.json`, `tsconfig.base.json`, `.nvmrc`, `.gitignore`, `.env.example`, `firebase.json`, `firestore.rules`, `storage.rules`, `firestore.indexes.json` — workspace, configuration, local emulators, and denied direct data access.
- `packages/contracts/src/{incident,analysis,requests,index}.ts` — shared runtime schemas and exported types.
- `apps/api/src/{app,server,config}.ts` — app factory, process entry point, and validated environment configuration.
- `apps/api/src/auth/session.ts` — Firebase token verification and session expiry checks.
- `apps/api/src/infra/{firebase,repository,audio-store}.ts` — Admin SDK adapters and transactional persistence.
- `apps/api/src/incidents/{routes,service,media}.ts` — receipt, queries, audio validation, playback, and deletion.
- `apps/api/src/analysis/{provider,fixture,gemini,service,routes}.ts` — provider boundary, prompt, normalization, lease/retry handling.
- `apps/api/src/review/{service,routes}.ts` — reviewer edits, approvals, and simulator transactions.
- `apps/api/src/demo/{limits,cleanup,routes}.ts` — atomic request quotas, reset, and scheduled retention cleanup.
- `apps/web/src/{main,App,firebase,api}.tsx` (use `.ts` for non-JSX modules), `apps/web/src/styles.css` — application shell and clients.
- `apps/web/src/features/{session,caller,responder}/` — small components for the three user flows.
- `fixtures/{manifest.json,audio/,expected/}`, `scripts/{evaluate,cleanup}.ts` — fictional samples, evaluation, and maintenance commands.
- `apps/api/test/`, `packages/contracts/test/`, `tests/e2e/` — contract, API, and browser behavior tests.
- `apps/api/Dockerfile`, `.dockerignore`, `docs/{development,deployment,judging-guide,evaluation}.md` — reproducibility and handover.

## Shared Interfaces and Decisions

Export these from `@copilot/contracts`; later tasks consume these exact names:

- `AnalysisState = 'pending' | 'processing' | 'ready' | 'failed'`.
- `ReviewState = 'pending' | 'needs_clarification' | 'approved' | 'closed'`.
- `SimulationState = 'not_started' | 'completed' | 'failed'`.
- `Urgency = 'urgent_review' | 'standard_review' | 'unclear'`; no numeric likelihood.
- `Routing = 'police' | 'fire' | 'medical' | 'other' | 'unclear'`; always a suggestion.
- `SourceLocation = {source: 'device' | 'sample'; latitude: number; longitude: number; accuracyMeters?: number; capturedAt: string}` with valid coordinate ranges; caller text is separate `locationDescription?: string`.
- `AnalysisBrief = {transcript: string; facts: Array<{text: string; quote: string; evidenceStatus: 'matched' | 'unverified'}>; unknowns: string[]; urgency: Urgency; routing: Routing; explanation: string}`.
- `ReviewDraft = {summary: string; urgency: Urgency; routing: Routing; locationDescription: string; confirmedFields: string[]}`. Allowlist confirmed fields to these four review fields; never rewrite original analysis.
- `Incident = {id: string; revision: number; createdAt: string; expiresAt: string; analysisState: AnalysisState; reviewState: ReviewState; simulationState: SimulationState; analysisMode: 'fixture' | 'live'; sourceLocation?: SourceLocation; locationDescription?: string; brief?: AnalysisBrief; reviewDraft?: ReviewDraft; failureCode?: string; dispatchReceipt?: DispatchReceipt}`. Internal records additionally hold owner UID, private audio key, attempts, and processing lease; never serialize these storage details.
- `DispatchReceipt = {id: string; incidentId: string; approvedRevision: number; createdAt: string; simulated: true}`.
- `DecisionRequest = {expectedRevision: number; action: 'approve' | 'needs_clarification' | 'close'; reason: string; idempotencyKey: string}`; approval requires a saved complete `ReviewDraft`, even after inference failure.
- API errors: `{error: {code: string; message: string; retryable: boolean}}`; redact underlying provider/credential details.

API paths all start `/api`. Verify Firebase bearer token and session ownership on every incident, audio, analysis, review, decision, and reset request. `POST /session` creates the caller's 24-hour demo session; fixture/live mode is server configuration, not a client-controlled bypass.

- `POST /incidents`: multipart recording plus JSON metadata or allowlisted `sampleId`; returns `201 Incident` after validated storage, before any inference.
- `GET /incidents` and `GET /incidents/:id`: owned, unexpired records only.
- `GET /incidents/:id/audio`: authenticated playback bytes with private/no-store caching, no public storage URL.
- `POST /incidents/:id/analyze`: await bounded inference and persist its outcome before completing the HTTP request; no unawaited background work on Cloud Run.
- `PATCH /incidents/:id/review`: `{expectedRevision, draft: ReviewDraft}`; atomic revision check and increment.
- `POST /incidents/:id/decision`: `DecisionRequest`; transactionally save decision/history and optional simulation receipt.
- `GET /incidents/:id/history`: ordered, redacted review/decision events for that session.
- `DELETE /session`: idempotently mark inaccessible first, then delete its recordings and documents; pending cleanup remains retryable.
- `GET /health`: liveness only; no configuration/secrets.

Defaults selected for the MVP: 10 MiB upload limit, 60-second maximum decoded duration, WAV/MP3/WebM/MP4 accepted only after probing, mono 16 kHz WAV normalization, 10-second media subprocess timeout, 45-second inference deadline, 3 analysis attempts per incident, 30 analysis attempts per session per hour, 1 active inference per session, 24-hour session/data expiry. Reject expired sessions on reads regardless of physical cleanup timing. Public deployment additionally uses service instance/concurrency limits and application-wide request limiting, verified against expected judge traffic.

## Task 1: Contracts and Executable Workspace

**Files:** Root workspace/config files; `packages/contracts/{package.json,tsconfig.json,src/*.ts,test/incident.test.ts}`.

**Interfaces:** Produces the shared schemas/types above, `parseModelBrief(input: unknown): AnalysisBrief`, and root `test`, `typecheck`, `build`, `dev`, `test:integration`, `test:e2e` scripts. Package names are `@copilot/contracts`, `@copilot/api`, `@copilot/web`.

- [ ] Create the workspace/configuration needed to run contract tests; ignore secrets, build output, emulator exports, recordings outside curated fixtures, and local credential files.
- [ ] Write `incident.test.ts`: `expect(analysisSchema.safeParse({...validBrief, probability: 0.97}).success).toBe(false)`; reject model coordinate fields and invalid enums; reject out-of-range device coordinates; preserve unknown values explicitly instead of inventing defaults.
- [ ] Run `npm run test --workspace @copilot/contracts`; confirm assertion/import failures from the missing contract implementation.
- [ ] Implement strict Zod schemas and exports in the mapped files. Require bounded strings/arrays and nonempty decision reasons; select and document practical field limits in the schema.
- [ ] Run the contract tests and `npm run typecheck`; expect all passing. Commit as `feat: define incident and review contracts`.

## Task 2: Authenticated Intake and Private Persistence

**Files:** API app/server/config; auth/session; infra adapters; incidents modules; demo/routes; Firebase configuration/rules; `apps/api/test/intake.test.ts`, `media.test.ts`, `isolation.integration.test.ts`; `docs/development.md`.

**Interfaces:** `buildApp(deps: AppDependencies): FastifyInstance`; `verifySession(token: string): Promise<Session>` where `Session={uid:string;expiresAt:string}`; `validateAudio(input: Uint8Array): Promise<{wav: Uint8Array;durationSeconds:number}>`. Repository and audio-store interfaces encapsulate storage so tests can inject failures; Firebase implementations are the default in emulator and cloud modes. Implement session/intake/read/audio routes defined above.

- [ ] Write tests: A's incident/audio queried by B returns 404; absent/invalid token returns 401; expired session returns 401; successful intake returns pending without calling inference; storage failure creates no usable recording reference. Include invalid media, 10 MiB + 1 byte, and decoded duration above 60 seconds rejection; exactly 60 seconds is accepted.
- [ ] Run `npm run test --workspace @copilot/api -- intake.test.ts media.test.ts`; expect failures for the missing handlers/adapters.
- [ ] Implement session verification, bounded upload parsing, ffprobe/FFmpeg execution with argument arrays and isolated temporary files, private audio storage, pending incident creation, list/read/audio paths. Clean temporary files in success/failure paths; clean orphan objects after failed persistence.
- [ ] Configure Auth/Firestore/Storage emulators and deny direct client document/object access. Use fake project ID `demo-emergency-copilot` locally and emulator-only environment checks that reject emulator bypass settings in cloud mode.
- [ ] Run `npm run test:integration` through Firebase `emulators:exec`; assert cross-session and expiry behavior against actual emulator adapters. Run Task 2 unit tests; expect all passing. Document prerequisites/start commands and commit as `feat: add private authenticated incident intake`.

## Task 3: Fixture and Real Gemini Analysis

**Files:** analysis modules; `demo/limits.ts`; repository lease/attempt methods; `apps/api/test/analysis.test.ts`, `limits.integration.test.ts`; fixture manifest/audio/expected; `scripts/evaluate.ts`; `docs/evaluation.md`.

**Interfaces:** `AnalysisProvider.analyze(input: {wav: Uint8Array; signal: AbortSignal}): Promise<unknown>`; `analyzeIncident(session: Session, id: string): Promise<Incident>`. Provider returns untrusted output; service validates it into `AnalysisBrief`. Fixture provider only accepts allowlisted fictional sample inputs; arbitrary audio in fixture mode returns a clear unsupported-input error, never an unrelated fixture brief.

- [ ] Write tests: fixture output remains `analysisMode='fixture'`; live provider failure yields `analysisState='failed'` with no fixture call; unsupported fields are rejected; a quote absent from the transcript is marked unverified; model coordinates never overwrite `sourceLocation`; timeout preserves original audio; a fourth analysis attempt is rejected. Test simultaneous requests acquire one lease, an expired lease can be retried within the attempt limit, and an old worker cannot commit after its lease was replaced.
- [ ] Run `npm run test --workspace @copilot/api -- analysis.test.ts`; expect failures for missing analysis behavior.
- [ ] Verify official Vertex AI SDK, available audio-capable model, structured output, and credential guidance. Implement `GeminiProvider` using configured project/location/model and application-default credentials; keep model name server-side. Send one bounded request, disable automatic SDK retries, do not give the model tools, and enforce the configured deadline. Record validation status of chosen model/configuration.
- [ ] Implement strict schema parsing, literal quote matching, redacted failure codes, atomic per-session/per-hour limits, persisted lease/attempt counters, lease-token checks on result writes, and revision increments. Forbid reanalysis of approved/closed incidents or while a saved review would be overwritten; approvals must not race with processing.
- [ ] Add five fictional, permission-cleared sample recordings (explicit threat, calm danger, benign weapon mention, noisy/ambiguous, missing location) with transcripts and expected facts. Document whether human-recorded or synthesized. Add an evaluation runner that reports field errors and latency without claiming a calibrated emergency classifier.
- [ ] Run Task 3 tests and emulator limit/lease tests. If credentials are available, run one live smoke analysis and the fixture evaluation; otherwise mark live verification blocked with exact setup needed while continuing credential-independent tasks. Commit as `feat: add bounded evidence-linked audio analysis`.

## Task 4: Human Review and Idempotent Simulator

**Files:** review/service and routes; transactional repository methods; `apps/api/test/review.integration.test.ts`.

**Interfaces:** `saveReview(session: Session, id: string, expectedRevision: number, draft: ReviewDraft): Promise<Incident>` and `decideIncident(session: Session, id: string, request: DecisionRequest): Promise<Incident>`; owned history endpoint. Persist history records with reviewer UID, reviewed revision, changes, decision/reason, and time.

- [ ] Write transaction tests: two identical concurrent approvals return the same receipt and create one dispatch event; stale revision returns 409; reusing an idempotency key with a different payload returns 409; another session cannot edit/approve; model analysis alone creates zero receipts; a manually completed failed-analysis incident can be approved; a processing incident cannot be approved; closing requires a reason and retains evidence.
- [ ] Run `npm run test:integration -- review.integration.test.ts`; expect failures from missing review handlers.
- [ ] Implement transactional edits, immutable original analysis, decision history, same-payload idempotency, and atomic receipt creation. Check existing idempotency records before rejecting a legitimate duplicate for its now-stale revision. The simulator performs no external call or notification.
- [ ] Run Task 4 emulator tests; expect all passing including races. Commit as `feat: add audited human review and mock dispatch`.

## Task 5: Complete Local Browser Experience

**Files:** web package/config, shell, Firebase/api clients, styles; features/session/{DemoEntry,SessionBanner}; features/caller/{CallerView,AudioInput,LocationInput}; features/responder/{ResponderView,IncidentList,IncidentDetail,ReviewForm,DecisionHistory}; `tests/e2e/demo.spec.ts`, `permissions.spec.ts`; `playwright.config.ts`.

**Interfaces:** `apiRequest<T>(path: string, init?: RequestInit): Promise<T>` attaches the current Firebase token; `useDemoSession()` creates/reuses the authenticated anonymous session. Caller and responder share the same demo session and owned incident ID. Root scripts start web/API/emulators without cloud credentials in fixture mode.

- [ ] Write Playwright flows: sample -> pending/ready -> evidence -> edit -> approve -> one simulated receipt; second browser context cannot read first's incident; location/microphone denied still permits sample use; failed live-provider test double shows failure and manual review; reload preserves session; fixture mode is visibly labeled.
- [ ] Run `npm run test:e2e`; confirm failures are missing behavior, not unexplained environment setup errors.
- [ ] Implement accessible responsive views, explicit record/stop with 60-second cap, upload/sample selection, device permission feedback, labeled source location, and authenticated audio playback via fetched blob URL (revoke when unused). Submit the pending incident before calling analyze; poll owned state every two seconds only while processing and stop after its deadline or when the view closes.
- [ ] Render reported facts, evidence status, unknowns, suggested urgency/routing, editable reviewer draft, history, and simulated receipt. Never translate a failed/unclear result into a benign conclusion. Use ordinary text rendering for model strings, visible keyboard focus, and text labels alongside urgency colors.
- [ ] Run browser tests, typecheck, and production build. Inspect desktop and narrow mobile viewport visually; verify no overflow and no blocked key action. Update README with exact startup commands and fixture/live limitations. Commit as `feat: deliver caller and responder demo workflow`.

## Task 6: Public-Demo Limits, Reset, and Cloud Deployment

**Files:** demo cleanup/routes/limits; `scripts/cleanup.ts`; Dockerfile/.dockerignore; deployment config; `docs/deployment.md`; `apps/api/test/cleanup.integration.test.ts`, `config.test.ts`.

**Interfaces:** `resetSession(session: Session): Promise<void>` revokes session access before deletion; `cleanupExpired(now: Date): Promise<{deleted: number;failed: number}>` retries partial cleanup of documents and objects. Cleanup runs in a scheduled Cloud Run Job with a dedicated service account; no public administrative cleanup endpoint.

- [ ] Write tests: reset is idempotent; partial object deletion failure is retryable while reads already fail; expired data is inaccessible before cleanup; cloud startup rejects fixture/emulator bypasses unless explicitly deployed as labeled fixture mode; unsafe CORS origins are rejected; concurrent requests cannot exceed the atomic global hourly quota; model errors/log serializers do not emit tokens, transcript content, or coordinates.
- [ ] Run Task 6 tests; expect failures for missing cleanup/config behavior.
- [ ] Implement 24-hour expiry enforcement, reset, cleanup job, redacted structured logging, allowed origins, and atomic quotas including a global hourly analysis limit. Configure the initial global limit as 100 analyses/hour and document tuning; return explicit retryable 429 responses. Include FFmpeg in the pinned runtime container; run as non-root with bounded temporary storage.
- [ ] Build and run the container locally; verify health, required environment validation, and frontend production build. Document Google Cloud/Firebase setup, anonymous auth, same-project IAM/storage, required APIs, Vertex AI model configuration, hosting rewrites, cleanup schedule, and service identity. Keep real project IDs in user-selected deployment configuration, never infer them from unrelated projects.
- [ ] With the user-selected project/access available, deploy Firebase Hosting and Cloud Run plus private persistence. Set a 120-second request timeout, 2 maximum service instances, and concurrency 4 as initial demo limits; test combined behavior with atomic application quotas. Enable scheduled cleanup and budget alerts, explicitly noting alerts are not spend caps.
- [ ] Smoke-test in a signed-out browser: live sample analysis, audio replay, review/approval, second-session isolation, reset, expiry/cleanup configuration, and mobile permissions. Record actual deployed URLs and results. If project access is unavailable, finish local/container checks and deployment instructions; mark deployment unverified and state the precise dependency. Commit as `feat: prepare and validate Google Cloud demo deployment` only describing checks actually performed.

## Task 7: Evaluation and Submission Handover

**Files:** `docs/{evaluation,judging-guide}.md`, README, `docs/submission/{deck-outline,demo-script}.md`; final PDF/video outputs only when actually produced and verified.

**Interfaces:** `npm run evaluate -- --mode fixture|live` outputs aggregate extraction errors, failure counts, and latency without saving arbitrary private recordings/transcripts. Judge guide points to the deployed app and describes three test paths with expected evidence and decision behavior.

- [ ] Run the full meaningful suite once after final code changes: `npm test`, `npm run test:integration`, `npm run test:e2e`, `npm run typecheck`, and `npm run build`. Fix failures before reporting completion; rerun affected tests after fixes.
- [ ] Run the five-case live evaluation when configured. Record sample provenance, model/configuration, date, number of cases, observed errors, and latency; distinguish expected annotations from model results. Do not claim responder-time benefits without an actual comparative user test.
- [ ] Write the judge guide, limitations, architecture/setup README, and a demo script under three minutes covering a complete live workflow plus an ambiguity/failure example. Draft a short deck around problem, audience, solution, Google Cloud implementation, observed evaluation, and limitations.
- [ ] Produce and visually inspect the PDF deck and record/verify the demo video using the appropriate artifact tools. Make the repository public and publish submission media only within the user's authorized publishing scope; never include keys, private recordings, or personal location data.
- [ ] Verify submitted links from a signed-out browser and keep the service available during evaluation. Commit documentation and hand over real URLs plus any unfinished dependencies; do not submit an entry to the competition on the user's behalf without instruction.

## Plan Self-Review

- Spec coverage: caller/responder UI (5), real and fixture providers/evidence (1,3), location provenance (1,2,5), failure/retry handling (3), manual review and audit trail (4), isolation and private playback (2), limits/retention/reset (3,6), local/cloud operation (2,5,6), evaluation/submission (7).
- Review Focus items each map to explicit tests above.
- Interfaces use one exported Incident/AnalysisBrief/ReviewDraft/DecisionRequest vocabulary; frontend API calls follow the paths above.
- Credential-dependent checks are visible gates for live verification/deployment, not reasons to stop local implementation.
- This plan has not been executed. No application checks or deployment outcomes are claimed.
