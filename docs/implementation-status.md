# Local milestone — 2026-10-04

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

| Check | Result |
| --- | --- |
| `npm test` | 22 unit tests passed |
| `npm run test:integration` | 7 authenticated emulator integration tests passed |
| `npm run test:e2e` | 9 Chrome browser tests passed |
| `npm run typecheck` | Passed |
| `npm run build` | Frontend and API production bundles built |
| `node --import tsx scripts/smoke-build.ts` | Built API health passed |
| Docker build and loopback container health | Passed; temporary container stopped |
| `npm run evaluate -- --mode fixture` | Five prepared samples passed schema/wiring checks |

Synthetic fixtures validate wiring, not model accuracy. Desktop and 390-pixel mobile screens were visually inspected. The real Chrome recording test uses Chrome's synthetic microphone device and exercises MediaRecorder/upload/manual review; it does not test a physical microphone or live Gemini. No cloud services were invoked by the container health check.

## Remaining work

- User-selected project, billing, appropriate region/model, Firebase web configuration, service identities and IAM.
- Live Gemini evaluation and prompt/quality assessment on a broader representative dataset.
- Cloud deployment, hosting URL, scheduled cleanup execution, signed-out access checks and operational review.
- Public repository/submission links and final PDF/video. Draft outlines are present only.
- Dependency follow-up: the production npm audit reports zero high/critical and two moderate transitive advisories (`gaxios`/`uuid` via Google Cloud Storage). Reassess dependency updates before a public deployment; no forced incompatible upgrade was applied. The development tooling also has upstream advisories. Local emulator runs emit upstream Java deprecation and SDK listener/metadata warnings; checks still pass.
