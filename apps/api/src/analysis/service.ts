import { reserveInference } from "./budget";
import { randomUUID } from "node:crypto";
import { parseModelBrief, type Incident } from "@copilot/contracts";
import { AppError, requireCondition } from "../errors";
import { assertSession, sessionKey, type Session } from "../auth/session";
import { own, incidentKey, type IncidentRecord } from "../incidents/service";
import type { Database } from "../infra/repository";
import type { AudioStore } from "../infra/audio-store";
import type { Config } from "../config";
import type { AnalysisProvider } from "./provider";
export class AnalysisService {
  constructor(
    private d: {
      db: Database;
      audio: AudioStore;
      config: Config;
      provider: AnalysisProvider;
    },
  ) {}
  async run(
    session: Session,
    id: string,
    signal?: AbortSignal,
  ): Promise<Incident> {
    const key = incidentKey(id),
      sk = sessionKey(session.uid),
      gk = "quota:global",
      token = randomUUID(),
      now = Date.now(),
      hour = Math.floor(now / 3600000);
    const until = now + this.d.config.analysisTimeout + 5000;
    const record = await this.d.db.transact([key, sk, gk], (docs) => {
      const s = assertSession(docs[sk]),
        r = own(docs[key], s);
      requireCondition(
        !r.turnIds?.length,
        409,
        "CONVERSATION_STARTED",
        "Continue in the incident conversation.",
      );
      requireCondition(
        r.audioKey,
        400,
        "NO_AUDIO",
        "This report has no audio.",
      );
      requireCondition(
        !["approved", "closed"].includes(r.incident.reviewState) &&
          !r.incident.reviewDraft,
        409,
        "REVIEW_STARTED",
        "Analysis cannot replace an existing human review.",
      );
      requireCondition(
        !s.activeLease || s.activeLease.until <= now,
        409,
        "ANALYSIS_ACTIVE",
        "Another analysis is still running.",
      );
      requireCondition(
        !r.lease || r.lease.until <= now,
        409,
        "ANALYSIS_ACTIVE",
        "This analysis is still running.",
      );
      requireCondition(
        r.attempts < 3,
        429,
        "ATTEMPT_LIMIT",
        "Three analysis attempts used. Continue with manual review.",
      );
      const budget = reserveInference(docs, sk, now);
      const next: IncidentRecord = {
        ...r,
        attempts: r.attempts + 1,
        lease: { token, until },
        incident: {
          ...r.incident,
          revision: r.incident.revision + 1,
          analysisState: "processing",
        },
      };
      delete next.incident.failureCode;
      return {
        result: next,
        put: {
          [key]: next,
          [sk]: {
            ...s,
            activeLease: { token, until },
            quota: budget.session.quota,
          },
          [gk]: budget.globalQuota,
        },
      };
    });
    let brief: ReturnType<typeof parseModelBrief> | undefined;
    let failureCode: string | undefined;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) controller.abort();
    let timer: NodeJS.Timeout | undefined;
    let rejectAbort: (() => void) | undefined;
    try {
      const operation = async () => {
        const wav = await this.d.audio.get(record.audioKey!);
        controller.signal.throwIfAborted();
        return this.d.provider.analyze({ wav, signal: controller.signal });
      };
      const output = await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          rejectAbort = () =>
            reject(
              new AppError(
                499,
                "ANALYSIS_INTERRUPTED",
                "Analysis interrupted.",
                true,
              ),
            );
          controller.signal.addEventListener("abort", rejectAbort, {
            once: true,
          });
          if (controller.signal.aborted) rejectAbort();
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(
              new AppError(
                504,
                "ANALYSIS_TIMEOUT",
                "Analysis timed out.",
                true,
              ),
            );
            controller.abort();
          }, this.d.config.analysisTimeout);
        }),
      ]);
      brief = parseModelBrief(output);
    } catch (e) {
      failureCode = e instanceof AppError ? e.code : "ANALYSIS_FAILED";
    } finally {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (rejectAbort)
        controller.signal.removeEventListener("abort", rejectAbort);
    }
    return this.d.db.transact([key, sk], (docs) => {
      const s = assertSession(docs[sk]),
        r = own(docs[key], s);
      requireCondition(
        r.lease?.token === token && s.activeLease?.token === token,
        409,
        "STALE_ANALYSIS",
        "A newer analysis replaced this request.",
      );
      const incident: Incident = {
        ...r.incident,
        revision: r.incident.revision + 1,
        analysisState: brief ? "ready" : "failed",
        ...(brief ? { brief } : { failureCode }),
      };
      delete r.lease;
      delete s.activeLease;
      return { result: incident, put: { [key]: { ...r, incident }, [sk]: s } };
    });
  }
}
