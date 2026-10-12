# Repository publication hygiene

The submission source includes the runnable web/API implementation, contracts, deterministic tests, fictional samples, regression fixtures and setup guides. It excludes actual deployment configuration, endpoints, account identifiers, raw operational/model evaluation records, screenshots, editor files, emulator data, build output and credentials.

## Private local material

Ignored `.env*` files hold local/browser configuration. `.env.example` contains placeholders only. `firebase.cloud.example.json` and `docs/cloud-runtime.example.yaml` are templates; their configured working copies stay ignored. `.private/` and unlisted `docs/` records are operator-only. Their local backups must not be attached to public issues or uploaded with source archives.

The GitHub repository is intended to remain private until the owner explicitly authorizes publication. Making source public makes it readable and copyable; omission of deployment configuration does not prevent copying of the implementation. No open-source license is introduced by this cleanup.

## Before each commit or publication

- Review exactly what is staged, including files staged before this task. Never use force-add on ignored configuration or private records.
- Scan the staged files and all reachable history for credentials and actual deployment/account details. `.gitignore` does not remove already-tracked files or erase history.
- Check binary assets manually; synthetic fixtures are permitted, real recordings and private screenshots are not.
- Run tests, type checking and builds. Check guides and fixtures work from the staged source alone, without private records.
- Share the judging link through the submission channel, not by embedding operational details in source.

Browser API addresses and Firebase/Maps browser configuration are observable at runtime. Enforce authentication, ownership, restricted key usage and quotas; do not rely on hiding URLs. Package-lock dependency URLs, official documentation links, local loopback addresses and API route names remain necessary, non-private source material.
