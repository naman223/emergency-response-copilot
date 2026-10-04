# Conversational Emergency Coordinator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task according to the user's selected method. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the form-first demo with a security officer's conversation with an AI emergency coordinator, including streamed replies, clarification, an updating incident brief and explicit human decisions.

**Architecture:** Extend the existing authenticated Fastify/Firebase incident workflow with persisted conversation turns and an authenticated fetch stream. Both a scripted local provider and a Vertex AI provider implement one streaming interface. React places the conversation first, with incident context and human review alongside it; model output cannot invoke dispatch.

**Tech Stack:** Existing TypeScript/npm workspaces, React/Vite, Fastify, Firebase Auth/Firestore/Storage, Zod, Google Gen AI SDK, Vitest and Playwright. Retain Node 22 and existing emulator/FFmpeg requirements. No new cloud services or dependency upgrades are assumed.

**Spec:** `docs/superpowers/specs/2026-10-04-conversational-coordinator-design.md` (approved).

**Execution:** Preserve the previously selected native execution method, with one independent final review. This plan awaits user review before implementation.

## Global Constraints

- Local first; the Google Cloud project will be supplied later. No deployment or live-quality claims.
- One AI emergency coordinator, short audio/text intake and typed follow-up; no continuous voice calls, speech synthesis or multi-agent simulation.
- Primary UI: officer/coordinator chat. Secondary UI: incident context and human review.
- Always label AI identity, simulation and scripted versus live mode. Do not display private reasoning or invented tool activity.
- Stream provisional user-facing text; apply an assessment only after complete validation. Do not display raw model JSON.
- At most one current clarification question; Unknown is a valid answer. Unresolved questions never remove manual-review access.
- Preserve original evidence and human edits; only explicit human approval can create a simulated receipt.
- One active generation per session; three attempts per turn; twenty submitted conversation turns per incident.
- Retain existing 45-second request deadline, 30 provider calls/session/hour, 100 globally/hour, 24-hour sessions, 20 incidents/session, and 60-second/10-MiB audio limits.
- Validate every ownership boundary; keep tokens out of stream URLs, and message content out of logs.
- Preserve the user's separately staged `.idea` files. Use explicit file lists for staging/committing.

## Review Focus

1. Double submission, reload or disconnect during streaming must not duplicate a message, restart billing implicitly, or leave processing stuck (Tasks 2, 4, 6).
2. “Unknown,” an explicit denial, or a later correction must not become a fabricated fact; no repeated question loop (Tasks 1, 3, 5).
3. A clarification after saving a human review must preserve the draft while preventing approval against outdated context (Task 5).
4. Quotes, escaped characters, Unicode and truncated JSON across stream boundaries must never expose raw JSON or apply partial assessments (Tasks 1, 3, 4).
5. A guessed incident/turn ID, reset during generation or revoked session must not expose another session's content or resurrect deleted records (Tasks 2, 4, 7).

## File map and shared interfaces

Modify existing contracts, incident intake, review and cleanup services without restructuring unrelated code. New modules:

- `packages/contracts/src/conversation.ts`: shared turn requests, persisted/public turn shapes, model response, assessment and event schemas.
- `apps/api/src/conversation/{provider,service,recovery,routes,stream,fixture,gemini,context,reply-decoder}.ts`: generation boundary, transactions, interrupted-turn recovery, HTTP routes, framing, providers, bounded model context and partial JSON string decoding.
- `apps/api/src/analysis/budget.ts`: shared atomic provider-call reservation used by legacy and conversational inference.
- `apps/web/src/features/conversation/{ConversationWorkspace,ConversationThread,MessageBubble,MessageComposer,IncidentContext,StartIncident,ReviewedIncident}.tsx`, `useConversation.ts`, `stream.ts`: focused UI/state/transport modules.
- `fixtures/conversations/*.json`: five documented deterministic scenarios; no broad keyword classifier pretending to be a model.
- Focused contract, provider, service, transport, emulator and browser tests in the existing test directories.

Shared names and contracts (define/export in Task 1; later tasks consume them):

- `TurnState = 'pending' | 'processing' | 'completed' | 'failed' | 'interrupted'`.
- `TurnRequest = {turnId: UUID, expectedRevision: number, kind: 'initial' | 'message', text?: string}`. Initial input comes from the persisted incident; a message requires 1–2000 trimmed characters. `RetryTurnRequest = {attemptId: UUID, expectedRevision: number}`.
- `EvidenceRef = {source: 'transcript' | 'officer', messageId?: UUID, quote: string}`. Officer references require a message ID; transcript references may refer only to the preserved source transcript. The server computes match status.
- `ConversationAssessment = {summary, facts, unknowns, urgency, routing, locationDescription}`. Summary <=2000 characters; <=20 facts, each <=600 characters with a source reference and server-derived evidence status; <=20 unknowns <=300 characters; location description <=500. Reuse existing urgency/routing enums. No coordinates, probabilities, tools or dispatch fields.
- `CoordinatorResponse = {reply: string, question: string | null, suggestedReplies: string[], assessment: ConversationAssessment | null, transcript?: string}`. Transcript is <=12000 characters, allowed only for the initial audio turn and preserved once as original source evidence; follow-up output cannot replace it. Reply 1–4000 characters, question <=300, <=4 suggestions <=200 each. Null assessment means no proposed update, including unsupported local input. The reply includes the question naturally; don't render it twice.
- `ConversationTurn = {id, incidentId, kind, officerText, state, attempts, createdAt, updatedAt, reply?, question?, suggestedReplies?, assessment?, completedRevision?, failureCode?}`. Times are ISO strings; attempt tokens, owner UID and request hashes remain server-only. An initial audio turn displays an audio attachment rather than inventing an officer transcript.
- `ConversationSnapshot = {incident: Incident, turns: ConversationTurn[]}`. Add optional `assessment`, `sourceTranscript`, `contextVersion` and `reviewContextVersion` to `Incident`, preserving legacy incident compatibility. First conversational context version is 1; each applied assessment increments it. Saving a human review records the current context version.
- `ConversationEvent` is a discriminated union with `turnId`, `sequence`, and `type`: `status` with stage, `delta` with text, `completed` with snapshot, or `failure` with safe code/message. Stages: `receiving_report`, `analyzing_report`, `receiving_response`, `updating_context`, `waiting_for_reply`. UI renders appropriate plain-language labels.
- `ProviderInput = {report: {text?: string, transcript?: string, wav?: Uint8Array}, turns: ConversationTurn[], assessment?: ConversationAssessment, sampleId?: string, signal: AbortSignal}`.
- `ProviderChunk = {type: 'delta', text: string} | {type: 'result', response: unknown}`; `ConversationProvider.generate(input: ProviderInput): AsyncIterable<ProviderChunk>`.
- `ConversationService.get(session, incidentId): Promise<ConversationSnapshot>`; `run(session, incidentId, request, emit): Promise<ConversationSnapshot>`; `retry(session, incidentId, turnId, request, emit): Promise<ConversationSnapshot>`. `emit(event)` returns `Promise<void>` to support bounded transport writes.

Store each turn in `turn:<incidentId>:<turnId>` using the existing Database adapter. Keep only an ordered turn-ID list, current active turn ID and context versions in `IncidentRecord`; do not accumulate all model replies in the incident document. Public turn IDs are UUIDs and order is transactional. Internal turn records retain canonical input, attempt IDs and lease token. Limit each serialized turn to 64 KiB before persistence and model context to 64 KiB plus the bounded original audio. Reject oversize context explicitly rather than silently losing a correction.

## Task 1: Shared conversation and provenance contracts

**Files:** create `packages/contracts/src/conversation.ts`, `packages/contracts/test/conversation.test.ts`; modify `src/{index,incident,requests}.ts` in the contracts package.

**Interfaces:** produce all shared types above, `validateCoordinatorResponse(input: unknown, sources: {transcript?: string, messages: Record<string,string>}, initialAudio: boolean): CoordinatorResponse`, and text intake via optional `reportText` in `IntakeRequest`. Intake accepts exactly one primary source: report text, sample or uploaded audio; validate uploaded-input exclusivity in the service.

- [ ] Write contract tests: `rejects_authority_fields` checks coordinates/dispatch/extra keys are rejected; `source_matching_uses_the_referenced_message` marks a quote from the wrong message unverified; `unknown_is_not_a_negative_finding` preserves the unknown list; `bounded_turn_and_reply` rejects text length 2001, reply length 4001 and five suggestions; `legacy_incidents_still_parse` accepts the existing incident shape. `followup_cannot_replace_transcript` rejects a transcript field outside an initial audio turn; initial source matching uses the validated returned transcript, with the UI explicitly distinguishing transcript agreement from audio verification.
- [ ] Run `npx vitest run packages/contracts/test/conversation.test.ts`; confirm failures are absent contract behavior.
- [ ] Implement schemas and provenance validation. Treat claims as reported even when their quote matches. Keep model-output status separate from server-derived evidence matching; never trust the model to certify its own evidence.
- [ ] Run all contract tests and `npm run typecheck`; commit only this task's files as `feat: define conversation and evidence contracts`.

## Task 2: Persisted, bounded conversation lifecycle

**Files:** create `apps/api/src/conversation/{service,recovery}.ts`, `apps/api/src/analysis/budget.ts`, `apps/api/test/conversation.test.ts`; modify `incidents/service.ts`, `analysis/service.ts`, `demo/cleanup.ts` and their tests.

**Interfaces:** consume Task 1 types; produce `ConversationService` methods above. `reserveInference(docs, sessionKey, now): {session: Session, globalQuota: {hour: number, count: number}}` is a pure helper used inside transactions on the session and `quota:global`. The service dependencies are `{db, audio, config, provider: ConversationProvider}`. Define the provider interface module in this task so service tests can use deterministic doubles.

- [ ] Write service tests: identical concurrent `turnId` submissions persist one officer message and invoke the provider once; conflicting payload returns 409; turn 21 returns 429; fourth attempt returns 429; concurrent sessions at global count 99 consume only one remaining slot; saved audio survives failure; completed retry returns the stored result; expiry of an old lease cannot clear a newer one.
- [ ] Write reset/recovery tests: failed or interrupted final attempt permits manual review; reset during generation prevents final persistence and removes turn records; text-only reports reset without trying to delete missing audio; a foreign session cannot get/run/retry any turn. Use the existing serialized memory transaction helper for unit tests.
- [ ] Run `npx vitest run apps/api/test/conversation.test.ts apps/api/test/cleanup.test.ts`; observe missing behavior.
- [ ] Implement transactional input reservation before inference, one active session lease, idempotent attempt records, deadline/cancellation and atomic finalization. Bounded generation increments quotas for every provider invocation, including invalid responses. No SDK automatic retries. Persist failed/interrupted status and retain original inputs; partial deltas cannot update the assessment.
- [ ] Add optional private audio to text intake (`audioKey` becomes optional) and add `reportText`. Existing audio playback returns a safe 404 for text-only reports. Share quota accounting with legacy analysis; reject legacy re-analysis once conversational turns exist. Integrate conversation recovery into incident reads so the old recovery path cannot release an active conversational lease or strand its turn record.
- [ ] Extend cleanup to delete declared turn records with each incident, preserving revocation-first behavior. Enforce terminal approved/closed state server-side. Run affected unit tests and typecheck; commit as `feat: persist recoverable coordinator conversations`.

## Task 3: Scripted and live streaming providers

**Files:** create `apps/api/src/conversation/{fixture,gemini,context,reply-decoder}.ts`, `apps/api/test/conversation-provider.test.ts`, `fixtures/conversations/{explicit-threat,calm-danger,benign-mention,ambiguous,missing-location}.json`; modify `server.ts`, `app.ts`, and `docs/evaluation.md`.

**Interfaces:** implement `FixtureConversationProvider` and `GeminiConversationProvider` using Task 2's interface. `buildConversationContext(input: ProviderInput)` supplies bounded, labeled report/messages to the model. `ReplyDecoder.push(jsonChunk: string): string` returns only newly decoded text from the top-level `reply` string; `finish()` requires valid complete JSON for final schema validation.

- [ ] Write provider tests: north-gate initial reply is substantive and asks the site; a supported site answer updates officer-sourced context and asks about injuries; Unknown stays unknown and advances the scenario; a documented correction supersedes the active fact but retains old messages; an unrelated free-form request returns an honest limitation and null assessment. Cover each of the five scenario scripts.
- [ ] Test stream decoding with every-byte chunk boundaries, escaped quotes/backslashes, split Unicode escapes, nested keys also named reply, reordered fields, duplicate top-level reply fields, missing final JSON and oversized output. No raw JSON reaches a delta; invalid/truncated output cannot produce a result. Test mocked SDK failure after initial deltas without fixture fallback.
- [ ] Run `npx vitest run apps/api/test/conversation-provider.test.ts`; verify absent behavior fails.
- [ ] Implement explicit script states and exact documented answers/suggestion IDs, including explanation requests and correction branches. Do not use broad keyword guessing. Local samples display Scripted sample mode; optional chunk pacing is explicitly demonstration playback. Unsupported personal recordings/text retain manual review with an honest response.
- [ ] Implement the live adapter with the installed SDK's `generateContentStream`, a single structured response containing reply plus assessment, AbortSignal, no tools/automatic retries, temperature 0 and max output 4096 tokens. Decode only the reply for provisional display; require the complete response to validate before finalization. Ignore thought parts. Bound raw accumulated model output to 64 KiB. If a field arrives late, wait honestly instead of inventing deltas.
- [ ] Include original audio for initial audio processing and preserve its validated completed transcript in `Incident.sourceTranscript` using Task 1 contracts. Follow-up turns cannot replace it. For older incidents with an existing brief, keep that brief immutable and use its transcript as source evidence. For text-only reports, source the initial officer message directly. Update server provider selection; run provider/unit tests and typecheck; commit as `feat: add scripted and Gemini coordinator providers`.

SDK references checked during planning: [streaming model API](https://googleapis.github.io/js-genai/release_docs/classes/models.Models.html), [request configuration](https://googleapis.github.io/js-genai/release_docs/interfaces/types.GenerateContentConfig.html), and [official SDK implementation](https://github.com/googleapis/js-genai/blob/main/src/models.ts). Verify the installed version during implementation; these references do not verify live model support or quality in the user's eventual project.

## Task 4: Authenticated HTTP stream and recovery API

**Files:** create `apps/api/src/conversation/{routes,stream}.ts`, `apps/api/test/conversation.integration.test.ts`; modify `app.ts` and integration test setup.

**Interfaces:** register `GET /api/incidents/:id/conversation`, `POST /api/incidents/:id/turns`, `POST /api/incidents/:id/turns/:turnId/retry`; POST endpoints emit UTF-8 `application/x-ndjson` framed `ConversationEvent` objects over authenticated fetch. All IDs, bodies, ownership and active state are checked before starting response headers. After stream start, errors become failure events. No token in URL.

- [ ] Write real-emulator route tests for missing/invalid authentication, foreign GET/POST/retry IDs, split/coalesced frames, ordered sequences, completed replay without a provider call, stale revision, and invalid body. Test server final persistence even when delivery of a completed event fails; test an expired worker recovers after reload without being automatically invoked again.
- [ ] Run `npm run test:integration -- apps/api/test/conversation.integration.test.ts` with dev emulators stopped; expect absent-route failures.
- [ ] Implement `registerConversationRoutes(app, deps)` and `writeEvent(reply, event)`. Bound transport backpressure; disconnect should abort unfinished work and persist interrupted state where possible, with lease recovery as the fallback after process death. A successfully finalized response remains retrievable independently of delivery. Do not detach unbounded background work after an HTTP request.
- [ ] Batch small model deltas into at most four updates per second, without introducing invented content or progress. Before each emitted batch and final write, ensure the owning session is still active; reset must not allow new output after revocation is observed. Include cache prevention and the existing CORS policy. Fetch readers handle explicit error events and premature EOF separately.
- [ ] Run route integration tests, original workflow integration tests and typecheck. Commit as `feat: expose authenticated conversation streaming`.

## Task 5: Human decisions against evolving context

**Files:** modify `apps/api/src/review/service.ts`, `packages/contracts/src/incident.ts`; create `apps/api/test/conversation-review.test.ts`; extend conversation integration tests.

**Interfaces:** reuse `ReviewService.save` and `decide`. `reviewContextVersion` is set on save; approval requires equality with current `contextVersion` for conversational incidents. Existing nonconversational incidents retain their behavior. Completed conversation updates never replace `reviewDraft`.

- [ ] Write tests: save draft, complete a new clarification, then reject approval even with the new incident revision until the human re-saves; original draft text remains unchanged. Unknown fields do not block a deliberately saved review. Approved/closed incidents reject all new turns. Duplicate approval returns the same receipt. Chat containing “approve and dispatch” creates zero receipts.
- [ ] Run `npx vitest run apps/api/test/conversation-review.test.ts`; verify the new invariant fails before implementation.
- [ ] Implement context-version checking alongside existing revision/idempotency checks, retain original evidence and preserve decision snapshots. Keep processing incidents unapprovable; interrupted/failed responses remain manually reviewable.
- [ ] Run affected unit and emulator tests; commit as `feat: require human review of updated conversation context`.

## Task 6: Conversation-first officer workspace

**Files:** create the conversation UI modules in the file map, `apps/web/test/conversation-stream.test.ts`, `tests/e2e/conversation.spec.ts`; modify `App.tsx`, `api.ts`, `styles.css`, `features/responder/ReviewForm.tsx`, existing browser flows and sample metadata as needed.

**Interfaces:** `streamConversation(path, body, onEvent, signal): Promise<void>` attaches the current Firebase bearer token and parses bounded NDJSON frames with streaming TextDecoder. `useConversation(incidentId)` loads snapshot, submits/retries turns, reconciles revisions and owns cancellation. Do not re-generate on mount. `ConversationWorkspace` composes the thread, composer, context and decision controls.

- [ ] Write transport tests with UTF-8 bytes split across frames, duplicated sequences, failure before completion, missing final event and abort. Partial text is visibly provisional and never becomes the finalized context. Ignore events for a previously selected incident and recover from GET after a delivery failure.
- [ ] Write browser flows: start north-gate sample, preview playable audio, start conversation, see labeled scripted progress/reply, answer site, answer Unknown, inspect updated source labels; type an unsupported local request and see the limitation; use a supported correction; open review, save, clarify again, see stale-review notice, re-save and approve once. Reload preserves chat and final human summary.
- [ ] Write mobile and interruption flows: composer/context/review reachable at 390px with no horizontal overflow; permission denial retains text/sample choices; switching incidents mid-response never appends the old response to the new chat. Preserve existing microphone lifecycle tests through the new intake entry point.
- [ ] Run targeted Vitest/browser commands and confirm failures reflect the missing UI, not an unavailable server.
- [ ] Replace role-switching primary navigation with incident conversations. Keep exact header AI emergency coordinator, mode badge and Simulation label. Use readable message bubbles, timestamps, a visible composer, relevant suggested replies and polite progress announcements. Preserve scroll position when reading earlier messages; offer a new-message indicator rather than forcing scroll. Enter sends; Shift+Enter adds a newline; respect IME composition.
- [ ] Implement start/report controls with distinct Preview recording and Start sample conversation actions. Add an authenticated sample-preview audio route if needed; validate listed sample IDs and serve only fictional fixture audio. Keep existing recorder cleanup and permission behavior. Text, upload, device location and location description retain clear provenance.
- [ ] Implement context and review panels. Human edits stay intact when the assessment updates; display Recheck your saved review against the new information. Present final readable summary, urgency, routing, location, remaining unknowns and decision reason with consistent padding; no raw enum names or schema keys. Approved conversations become read-only. Format the existing final-card defect as part of this component.
- [ ] Run browser tests, typecheck and build; visually inspect desktop, mobile, streaming, failure and approved-report states. Commit as `feat: deliver conversational emergency coordinator workspace`.

## Task 7: Integration verification and local handover

**Files:** update `README.md`, `docs/{development,evaluation,judging-guide,implementation-status}.md`, submission drafts and `.env.example` only where configuration changes. Add missing regression cases to owning test files; no unrelated refactors.

- [ ] Run the final meaningful suite: `npm test`, `npm run typecheck`, `npm run test:integration`, `npm run test:e2e`, `npm run build`, built-API smoke and local container build/health. Stop only this task's dev processes for emulator conflicts; restart the preview afterward. Run affected checks again only after changes or unresolved failures.
- [ ] Add final emulator proof for reset during streaming and conversation deletion, concurrency at the global quota boundary, private sample/incident playback and terminal decision behavior. Verify existing audio limits, authentication and approval invariants still pass.
- [ ] Run one independent final review of implementation against the approved design and plan. Fix actionable findings with regression evidence, then rerun affected checks; no automatic repeated review loops.
- [ ] Document exact scripted branches and limitations, actual local test evidence, stream recovery and how a future cloud project enables real free-form conversation. Do not count fixture responses as model evaluation. Live model tests, public deployment and final submission media remain pending.
- [ ] Commit explicit project files, preserve staged `.idea`, start the verified local preview, and hand over the URL with a brief sample-conversation walkthrough. Report the actual branch/commit and that no cloud deployment or Git push was performed unless separately authorized.

## Self-review and execution gate

Coverage: user conversation/visual requirements (6), richer contextual clarification (1,3,6), streaming/provenance (1–4), lifecycle/ownership/quotas/reset (2,4,7), human decision invariants (5), local/live honesty and evaluation (3,7). All five Review Focus cases map to named tests. Existing audio and human-review controls are reused.

Initial transcript fields and validation are defined in Task 1 and consumed consistently by Task 3; completed source evidence remains separate from evolving assessments. No assumed real model ID or new dependency is required. Native execution remains the preserved choice. No implementation or test-pass claims are made by this plan.

Next: user review of this implementation plan, then execute with `superpowers:executing-plans`.
