# Conversational coordinator — local guide

Start a demo session, then choose **Start conversation** on a sample. **Preview recording** plays that sample before intake. The center is your conversation with an AI emergency coordinator; the incident context is beside it or behind **Incident context** on mobile.

## Scripted sample replies

The local provider is deterministic, not a language model. It recognizes these documented replies:

- **University campus, beside the library** or **North gate of the campus** supplies sample location.
- **Location: your description** supplies a location explicitly. **Correction: your description** replaces that location, retaining the previous messages.
- **Unknown** preserves a gap and moves on; it does not mean no injury or no danger.
- **Why this recommendation?** explains the sample's suggestion using the original reported content.
- Scenario-specific buttons offer injury status, visible smoke versus smell, equipment enquiry versus threat, or whether someone is requesting help.

Other messages are retained but do not update the assessment; the coordinator says that free-form interpretation requires the live model. Original input and unverified officer information are separate from a human's saved review.

## Human decision

Open **Review and decide**, check and save the summary, urgency, routing and location, enter a decision reason, then approve the simulation or close the report. A new assessed clarification invalidates the saved review's context version without deleting its text. Recheck and save it before approval. Unknown information does not prevent a deliberate human decision. A chat message alone never dispatches.

## Streaming and recovery

The server streams typed progress and reply events using authenticated fetch. Local chunks are labeled scripted playback; live mode uses Gemini response chunks. Partial replies are provisional. Only a completely validated result updates context. After a disconnect or process interruption, reload retrieves the stored turn; an expired lease becomes interrupted and can be retried up to three attempts. Original reports remain available for manual review.

Limits: twenty turns per incident, one active generation per session, three attempts per turn, 45-second provider deadline, 30 calls per session/hour and 100 globally/hour. Context and raw model responses are bounded. Reset deletes the incident's turns and audio after revoking the session.

## Live boundary

A Vertex AI streaming conversation adapter is implemented but remains unverified against a live project/model. Configure the user-selected Google Cloud project later and evaluate free-form conversations, corrections and source fidelity before claiming AI quality. No cloud resources were created by this milestone.
