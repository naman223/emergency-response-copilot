# Conversational Emergency Coordinator

Status: Written design approved by the user on 2026-10-04. Supersedes the form-first responder experience in the original MVP design. Implementation remains pending implementation-plan review.

## User intent

The security officer should feel they are reporting an incident to an emergency coordinator in a chatbot. The coordinator acknowledges the report, explains its assessment, asks useful follow-up questions and revises the incident context as the officer answers. The conversation is the primary experience; structured review supports it.

Confirmed by the user: conversational interaction with the security person, richer responses, visible processing/streaming, clarification based on input, and a properly formatted final incident report. Existing constraint: build locally first; a Google Cloud project will be supplied later.

Assumptions for this iteration: typed multi-turn follow-up, the existing short-audio and sample inputs, English, one AI coordinator, and simulated dispatch. Continuous two-way voice, speech synthesis, multiple independent AI agents and contact with real authorities remain outside this iteration.

## Chosen approach

Expand the existing authenticated incident workflow into a conversation-first coordinator workspace. Retain private audio, session ownership, evidence, human edits and transactional dispatch controls.

A cosmetic animated report would not satisfy the requested interaction. A full live voice call would introduce interruption and microphone-session complexity beyond this iteration. The selected middle scope is an audio/text report followed by a streaming text conversation, with later live-model configuration.

## Screen and interaction

The primary navigation becomes Incident conversations. The landing action is Start an incident, with clearly described sample scenarios and an option to report using text, audio or upload. A sample offers separate Preview recording and Start sample conversation actions; selecting a sample must not misleadingly resemble playback.

Desktop layout: a compact incident list, a central conversation, and an adjacent Incident context panel. On mobile, the conversation comes first; context and decision review open through clearly labeled controls. Do not force the officer to switch between caller and responder roles to understand the demo. Preserve the distinction between caller audio and information supplied by the officer.

The central header reads AI emergency coordinator, with a persistent Simulation label and either Scripted sample mode or Live Gemini. The conversational tone is calm, concise and professional, like a coordinator speaking with an officer. It must not claim to be a real superior, dispatcher or emergency service, or claim anyone has been sent.

Messages include clear speaker labels, time, and whether a response is still arriving, complete or interrupted. The composer remains near the conversation and supports a typed reply and context-relevant suggested replies. Original audio remains playable in its message. The officer can ask why a recommendation was made, add observations, correct a previous answer or answer Unknown.

An example response to the north-gate sample:

“Received. The caller reports being followed near the north gate and mentions a knife. I suggest urgent human review based on those reported details. The exact site and injury status are still unknown. Which site does ‘north gate’ refer to?”

If the officer replies “University campus,” the coordinator acknowledges that as officer-provided location information, updates the context panel and asks a relevant remaining question. If the officer replies “Unknown,” the gap remains explicit; do not keep demanding the same answer. Questions should normally be asked one at a time. They should not delay access to manual review or simulation approval when the human chooses to proceed with unresolved information.

## Observable progress and streaming

Use backend-generated states such as Receiving report, Analyzing report, Receiving coordinator response, Updating incident context, Waiting for your reply, and Response interrupted. Audio-specific labels appear only for audio input. Do not show fictitious tool calls, agent collaboration, numerical progress or private chain-of-thought.

The live adapter streams user-facing response text when supported by the configured model/API. Verify SDK behavior during implementation. Structured incident updates apply only after the completed response passes validation. Never display raw JSON or let partial text trigger actions. Partial text is visibly provisional and cannot become an approved assessment.

Use an authenticated fetch streaming response rather than putting bearer tokens in URLs. Events have a turn ID, sequence and typed payload: status, text delta, completed turn, or failure. Render deltas as text. Store the officer message before inference; atomically finalize the coordinator reply and validated incident update. Streaming must not depend on an open browser to preserve a completed server result.

On disconnection or reload, recover persisted turn status rather than silently generating the message again. An incomplete response is marked interrupted after its lease expires. Retrying uses a fresh bounded attempt tied to the same original turn, with no duplicate officer message. Completed turn retries return the existing result. Pending operations cannot run indefinitely or release a newer turn’s lease.

## Conversation and assessment contract

A conversation belongs to one incident and its verified session owner. Persist ordered user/coordinator messages, source type, turn/request identifiers, timestamps, completion state and the incident revision they informed. Conversation content follows the existing private-data retention and reset rules.

The model receives the original report and a bounded history of this incident only. Its output supplies a user-facing reply, at most one current clarification question, and a proposed assessment containing a substantive summary, reported facts/evidence, unresolved questions, suggested urgency and suggested responder.

Keep the original audio/transcript and assessment as immutable source evidence. Updated facts link to the source transcript or a particular officer message. Mark officer statements as officer-reported, not independently verified. Distinguish absent information, explicit denial and contradictory statements. A correction can supersede an earlier claim without erasing its history. The server validates source references and keeps unmatched claims unverified.

Only device metadata may populate device coordinates/accuracy. The model must not invent location coordinates, emergency probabilities or external verification. Text in messages and recordings is untrusted report content; it cannot change authorization, dispatch, invoke tools or override the coordinator’s system instructions.

## Human control and final report

Keep Review and decide available beside the chat. It opens a compact summary of the proposed assessment for human correction, including unresolved questions. Approval remains an explicit control with a reason and exact revision; saying “dispatch” in chat never invokes it. Existing same-request idempotency and session isolation remain mandatory.

A new completed conversational assessment cannot overwrite a saved human draft. Mark that draft as needing review against the newer context and require deliberate save before approval. Reject stale approvals. Approved or closed incidents keep a read-only conversation and decision snapshot; further reporting starts a new incident.

The final card has consistent padding, a useful incident narrative, readable urgency and routing labels, reviewed location, remaining unknowns, decision reason and simulated receipt. Replace raw implementation names such as urgent_review and locationDescription with user-facing language. Show version/audit detail only where it helps explain which information was approved. Keep AI suggestions distinguishable from the human’s saved decision.

## Local demonstration and live mode

Local mode provides five expressly labeled scripted scenario conversations with meaningful acknowledgments, clarification branches, Unknown answers and revised summaries. Prepared response chunks are labeled demonstration playback, never live Gemini output. Only documented sample answers/branches receive scripted interpretation. Unrecognized free-form requests are retained and receive an honest limitation message; do not fabricate an intelligent interpretation or unrelated prepared answer. Officers can still manually edit and decide.

The same UI and persisted turn interface supports a real conversational Gemini adapter. Live free-form interpretation, quality, latency and model-specific streaming require the user-selected project and live evaluation. No fallback from a failed live request to a script is permitted. No cloud deployment or project creation is part of this iteration.

## Boundaries and failure handling

Enforce session ownership on every conversation read/write/stream and recover endpoint. Retain existing expiry, private playback and reset. Reset revokes access before cleanup and includes conversation data.

Allow one active generation per session. Reuse the existing global/session inference quotas, counting every provider invocation, with at most three attempts per turn and twenty submitted conversation turns per incident. Bound message size, model context and output, and provider request duration. Exhausting a limit leaves history/audio available for manual review. Logs exclude message content, audio, coordinates and tokens.

An unavailable model, invalid assessment, transport failure or timeout must preserve the officer report, show a useful failure message and keep manual review accessible. Successful partial text alone is not a successful assessment. Clarifications should request incident facts, not deliver medical procedures or tactical intervention instructions.

## Acceptance evidence

- A new tester can start a sample and understand that they are the officer speaking to an AI coordinator without a verbal walkthrough.
- The sample includes a substantive response, a relevant question, an answer, and a visibly updated context panel; Unknown remains unknown.
- Free-form live turns use actual model output when configured; scripts remain visibly distinct and unsupported local requests are honest.
- Backend progress events, streamed deltas, interrupted generation, reload recovery and retries preserve a coherent conversation without duplicated turns.
- A correction retains its source and history; unsupported coordinates and dispatch instructions do not bypass server controls.
- A second session cannot access another conversation, stream, audio or decision.
- Clarification, saved human edits, later AI updates and approval obey revision checks; repeated approval creates one simulated receipt.
- Desktop/mobile views show readable messages, a usable composer, accessible context/review controls and a correctly formatted final report.
- Unit/service, emulator integration and browser tests cover these behaviors; live inference remains explicitly unverified until credentials/project are provided.

## Next gate

Written design approved. Next: review the implementation plan. Preserve the previously selected native execution method unless the user changes it. No implementation-plan approval or completed implementation is claimed.
