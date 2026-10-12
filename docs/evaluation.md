# Evaluation boundaries

The prototype has deterministic unit tests, authenticated emulator integration tests, browser acceptance tests and fictional live-model checks. Passing tests establish their covered behavior, not emergency-triage accuracy, clinical safety or guaranteed availability.

## Reproduce local checks

```sh
npm test
npm run typecheck
npm run build
npm run test:integration
npm run test:e2e
npm run evaluate -- --mode fixture
```

Use the documented Node/Java/FFmpeg prerequisites. Stop a demo occupying emulator ports before running isolated integration checks. Browser tests use the configured Google Chrome channel. These commands use fixtures or mocked model transport; do not describe them as live inference.

For configured live testing, `npm run dev:live` uses local Firebase emulators and Gemini. Evaluation scripts in `scripts/` submit fictional cases and can incur model charges. Store their generated outputs privately. Fixture mode uses prepared conversation branches; it does not measure extraction quality.

## Evidence and regression coverage

- Shared schemas, exact source quotations, preserved uncertainty, conservative denial checks and conflicting service indicators.
- Bounded clarification, early finish, corrections, repair-state preservation and saved history.
- Protected audio/data access, session ownership, expiry and reset.
- Revision-aware human review, idempotent multi-service simulated receipts and location carry-forward.
- Model failures, deadlines, disconnect recovery, media limits and shutdown behavior.

`fixtures/regressions/` retains minimal fictional inputs/responses for deterministic defect reproduction. A medical source fixture was extracted from a captured model response and stripped of live run metadata; it is not a real incident. Broader synthetic scripts include English and Hindi, degraded audio, silence/noise controls and cross-location reports.

Live fictional walkthroughs have demonstrated transcription, clarification, review, map selection, simulation receipts, reload, isolation and cleanup. Some model attempts failed rate limits or evidence/consistency validation. A successful repeat does not erase those failures or establish an acceptance rate. Full operational recordings, timing traces, identifiers and account-specific cloud checks are deliberately not public artifacts.

## Remaining validation

Real microphones, representative speakers/accents, additional languages, noisy audio and fully localized conversations need further testing. A Hindi or mixed-language transcript is not proof of reliable end-to-end assessment. Match quotes, negation, current versus historical danger and clinical uncertainty manually.

Quote matching proves attribution only; narrow phrase checks do not prove semantic correctness. No calibrated threat probability, clinical accuracy benchmark, trained-responder comparison or measured response-time benefit is claimed. Independent responder authorization, real service integrations, broader abuse/load testing and remaining media-library security work are outside current prototype proof.
