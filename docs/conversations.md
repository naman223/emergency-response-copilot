# Conversational coordinator — local guide

Start a demo session, then choose **Start conversation** on a sample. **Preview recording** plays that sample before intake. The center is your conversation with an AI emergency coordinator; the incident context is beside it or behind **Incident context** on mobile.

## Review a recording before starting

In live mode, **Stop recording** (including the 60-second automatic stop) or **Upload audio** requests a Gemini transcript and reported-location suggestion. **What is happening?** fills with the transcript when empty and unchanged; review and edit it before choosing **Start conversation**. If you already typed a report or edited it while transcription was running, the transcript is shown separately with **Use transcript in report**, so your text is not overwritten. You can play or remove the attached recording. Editing the report keeps the original audio attached; both are saved only when you explicitly start the conversation.

An explicitly mentioned incident location can fill the empty location field. This copies reported wording, not verified coordinates or a geocoded address; it never replaces a manually entered location. Editing a report clears a location that was automatically suggested from its previous text. **Suggest location from report** extracts a location from typed or corrected text. Device GPS remains separate. Unknown or ambiguous location stays unknown, and human verification is still required for a service lookup.

The start buttons are disabled during recording or preview processing. If transcription fails, the recording stays attached and **Retry transcription**, manual typing, or starting with audio remains available. In scripted mode, personal-audio transcription is unavailable and is labeled as such. Preview requests require an active session and share the existing inference quotas and deadline. They do not create incidents, turns or saved audio; temporary audio used for validation is removed. Live mode sends the recording to Google at preview time, before the start button is clicked. Starting the conversation processes the attached original recording again alongside the reviewed report.

## Scripted sample replies

The local provider is deterministic, not a language model. It recognizes these documented replies:

- **University campus, beside the library** or **North gate of the campus** supplies sample location.
- **Location: your description** supplies a location explicitly. **Correction: your description** replaces that location, retaining the previous messages.
- **Unknown** marks the current unanswered field as unknown and moves on. After both questions are answered, it marks the last explicitly changed field unknown, superseding that answer. It does not mean no injury or no danger.
- **Why this recommendation?** explains the sample's suggestion using the original reported content.
- Scenario-specific buttons offer injury status, visible smoke versus smell, equipment enquiry versus threat, or whether someone is requesting help.

Other messages are retained but do not update the assessment; the coordinator says that free-form interpretation requires the live model. Original input and unverified officer information are separate from a human's saved review.

## Bounded intake and service handoff

The coordinator targets five essential topics: incident location, what happened, immediate danger, injuries/medical needs, and caller safety/contact. It asks only for missing information. Five clarification questions is the normal target; after that the model must identify a critical reason to continue, and the server enforces a hard ceiling of ten. Urgent assessments and sufficient-information responses finish earlier. **Finish assessment now** also closes intake with the information available.

**Assessment ready** presents urgency, suggested responder and remaining unknowns. New officer updates revise the assessment without restarting clarification. Readiness is separate from human approval; it cannot send a dispatch. Urgency is assessed throughout, so an urgent report does not wait for ten answers.

During generation the app streams progress states. Reply text is published after schema validation and the stopping rule, so a discarded follow-up question cannot appear briefly before the final assessment. This means live text may arrive as one batch after the model finishes.

In **Review handoff**, enter and verify the full incident address or coordinates. **Find nearby services in Google Maps** opens real map search results for police stations, fire stations, hospital emergency departments, or other emergency services near that location. It shares the search location/type with Google Maps, not the incident narrative. Results are not an automatic nearest-available dispatch decision. The reviewer checks suitability/contact details and records a selected service name; saving and approving retains it in the simulated handoff report. No service is contacted. Changing the location/routing or removing location confirmation clears the selected destination.

The existing 20-turn limit includes initial intake, clarifications, finish requests and voluntary updates. Interrupted attempts do not consume additional completed-question count, and retries cannot reopen a ready assessment.

## Saving and approving the human review

The conversation opens with **Human review** selected. Summary, urgency, responder and reported location fill from the available report and latest assessment. **Send review** saves these values without requiring any typing; the editable decision reason has a neutral default. Check the populated review, send it, then separately choose **Approve simulation** or close the report. Sending a review alone never dispatches. Unknown information does not prevent a deliberate human decision and is never converted into a verified fact.

Untouched fields update with the conversation. Fields a human edits are preserved, including unsaved edits while another clarification is being processed. A new officer update invalidates a saved review before inference begins, so even an interrupted response requires the latest information to be reviewed before approval. The incident retains the original submitted text, source transcript, supporting facts, remaining unknowns, and the full ordered **Clarifications and updates** history. Unassessed answers are labeled; corrections remain visible alongside earlier statements and survive approval/reload.

**Select incident location on map** opens Google Maps inside the review when a browser key is configured. Search an address, choose a result or click a point, and press **Confirm this incident location**. The selected description and coordinates populate the review and are saved separately from device GPS. Nearby-service lookup uses that selected point. Editing the location manually clears the old map point, location confirmation and service destination. Location selection is optional; the review can still be sent if a location is unknown or Maps cannot load. A map starts near device GPS when provided, but this center is not automatically selected as the incident location.

## Streaming and recovery

The server streams typed progress and reply events using authenticated fetch. Local mode is labeled scripted playback; live mode receives Gemini response chunks but buffers the text until validation and the stopping rule are applied. Only an accepted result is published and updates context. After a disconnect or process interruption, reload retrieves the stored turn; an expired lease becomes interrupted and can be retried up to three attempts. Only the latest interrupted turn can be retried; after a later message, continue from that message instead. Original reports remain available for manual review.

Limits: twenty turns per incident, one active generation per session, three attempts per turn, 45-second provider deadline, 30 calls per session/hour and 100 globally/hour. Context and raw model responses are bounded. Reset deletes the incident's turns and audio after revoking the session.

## Live boundary

A Vertex AI streaming conversation adapter is implemented. Local live checks with Gemini 3.5 Flash have exercised a fictional free-form text report, a location/status correction, and a caller recording. An audio attribution issue found during those checks was corrected by explicitly distinguishing the caller recording from the officer's messages; the repeated sample returned transcript-sourced facts with matching quotes. These few checks establish connectivity and basic behavior, not emergency-response accuracy or general model quality.

Use `npm run dev:live` after configuring the ignored `.env.live` file and Google authentication; see [local setup](development.md#local-app-with-live-gemini). Plain `npm run dev` still selects scripted mode. The app and Firebase remain local in both modes. Live mode sends report content to Google for inference and uses the configured cloud project's billing. No public deployment has been made.
