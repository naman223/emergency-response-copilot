# Conversational coordinator — local guide

Start a demo session, then choose **Start conversation** on a sample. **Preview recording** plays that sample before intake. The center is your conversation with an AI emergency coordinator; the incident context is beside it or behind **Incident context** on mobile.

## Scripted sample replies

The local provider is deterministic, not a language model. It recognizes these documented replies:

- **University campus, beside the library** or **North gate of the campus** supplies sample location.
- **Location: your description** supplies a location explicitly. **Correction: your description** replaces that location, retaining the previous messages.
- **Unknown** marks the current unanswered field as unknown and moves on. After both questions are answered, it marks the last explicitly changed field unknown, superseding that answer. It does not mean no injury or no danger.
- **Why this recommendation?** explains the sample's suggestion using the original reported content.
- Scenario-specific buttons offer injury status, visible smoke versus smell, equipment enquiry versus threat, or whether someone is requesting help.

Other messages are retained but do not update the assessment; the coordinator says that free-form interpretation requires the live model. Original input and unverified officer information are separate from a human's saved review.

## Human decision

Open **Review and decide**, check and save the summary, urgency, routing and location, enter a decision reason, then approve the simulation or close the report. A new assessed clarification invalidates the saved review's context version without deleting its text. Recheck and save it before approval. Unknown information does not prevent a deliberate human decision. A chat message alone never dispatches.

## Streaming and recovery

The server streams typed progress and reply events using authenticated fetch. Local chunks are labeled scripted playback; live mode uses Gemini response chunks. Partial replies are provisional. Only a completely validated result updates context. After a disconnect or process interruption, reload retrieves the stored turn; an expired lease becomes interrupted and can be retried up to three attempts. Only the latest interrupted turn can be retried; after a later message, continue from that message instead. Original reports remain available for manual review.

Limits: twenty turns per incident, one active generation per session, three attempts per turn, 45-second provider deadline, 30 calls per session/hour and 100 globally/hour. Context and raw model responses are bounded. Reset deletes the incident's turns and audio after revoking the session.

## Live boundary

A Vertex AI streaming conversation adapter is implemented. Local live checks with Gemini 3.5 Flash have exercised a fictional free-form text report, a location/status correction, and a caller recording. An audio attribution issue found during those checks was corrected by explicitly distinguishing the caller recording from the officer's messages; the repeated sample returned transcript-sourced facts with matching quotes. These few checks establish connectivity and basic behavior, not emergency-response accuracy or general model quality.

Use `npm run dev:live` after configuring the ignored `.env.live` file and Google authentication; see [local setup](development.md#local-app-with-live-gemini). Plain `npm run dev` still selects scripted mode. The app and Firebase remain local in both modes. Live mode sends report content to Google for inference and uses the configured cloud project's billing. No public deployment has been made.
