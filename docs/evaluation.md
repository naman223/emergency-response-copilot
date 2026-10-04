# Evaluation boundaries

The five sample recordings were generated from original fictional text using the macOS Samantha system voice, then normalized with FFmpeg to mono 16 kHz PCM WAV. The ambiguous example is bandwidth-limited to simulate poor audio quality. These are synthetic examples, not representative real emergency calls.

`fixtures/expected/*.json` contains written expectations. The fixture provider matches recordings by SHA-256 and returns their prepared brief. An unfamiliar recording is never mapped to an unrelated prepared result.

Run `npm run evaluate -- --mode fixture` for a deterministic wiring/schema smoke check. Zero mismatches in fixture mode does not establish model accuracy. With the later project/model/credential configuration, `npm run evaluate -- --mode live` analyzes the same audio through Gemini and reports suggested urgency/routing mismatches, unverified quote counts, failures and latency. Review the full outputs manually before making extraction-quality claims; exact labels alone do not measure semantic correctness.

No live Gemini evaluation, calibrated threat probability, comparison with trained responders, or measured responder-time benefit is currently claimed. Results cover only the listed synthetic samples and cannot establish production safety.
