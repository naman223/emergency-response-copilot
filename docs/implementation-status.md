# Implementation status

The runnable prototype implements voice/text preview, conversational clarification, evidence-linked service indicators, editable human review, confirmed map points and multi-service simulated handoff. Private session ownership, audio playback, reset/expiry, reload recovery and bounded model processing are implemented.

Cloud deployment support includes a non-root API container, Firebase Hosting configuration template, named Firestore database, private audio bucket, keyless identities and scheduled cleanup. Account-specific deployment state and runbooks are excluded from Git.

Notifications are simulated. Separate citizen/responder identities, real dispatch/SMS, general multilingual validation, production abuse controls and full production security/readiness remain future work. Failed model validation remains a known reliability boundary, with retry/manual review available.

See [technical brief](technical-brief.md), [judge walkthrough](judging-guide.md), [evaluation boundaries](evaluation.md) and [publication hygiene](publication-hygiene.md).
