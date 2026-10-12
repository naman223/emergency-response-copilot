import { recoverConversation } from "../conversation/recovery";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  incidentSchema,
  type Incident,
  type IntakeRequest,
} from "@copilot/contracts";
import { assertSession, sessionKey, type Session } from "../auth/session";
import type { Database } from "../infra/repository";
import type { AudioStore } from "../infra/audio-store";
import type { Config } from "../config";
import { requireCondition } from "../errors";
import { validateAudio } from "./media";
export type Event = {
  id: string;
  action: string;
  at: string;
  reviewerUid: string;
  revision: number;
  reason?: string;
  draft?: unknown;
};
export type IncidentRecord = {
  incident: Incident;
  ownerUid: string;
  audioKey?: string;
  reportText?: string;
  turnIds?: string[];
  activeTurnId?: string;
  attempts: number;
  sampleId?: string;
  lease?: { token: string; until: number };
  history: Event[];
  decisions: Record<string, { request: string; incident: Incident }>;
};
export const incidentKey = (id: string) => `incident:${id}`;
export const fixtureRoot = () => resolve(process.env.FIXTURE_DIR ?? "fixtures");
export async function samples(): Promise<
  Array<{ id: string; title: string; label: string; description: string }>
> {
  return JSON.parse(
    await readFile(resolve(fixtureRoot(), "manifest.json"), "utf8"),
  );
}
export function own(record: IncidentRecord | undefined, session: Session) {
  requireCondition(
    record &&
      record.ownerUid === session.uid &&
      Date.parse(record.incident.expiresAt) > Date.now(),
    404,
    "NOT_FOUND",
    "Incident not found.",
  );
  return record;
}
export class IncidentService {
  constructor(
    private deps: { db: Database; audio: AudioStore; config: Config },
  ) {}
  async create(session: Session, metadata: IntakeRequest, input?: Uint8Array) {
    const { db, audio, config } = this.deps;
    requireCondition(
      metadata.sampleId
        ? !metadata.reportText && !input
        : !!metadata.reportText || !!input,
      400,
      "INVALID_INPUT",
      "Choose a sample, or provide report text and/or a recording.",
    );
    let wav: Uint8Array | undefined;
    if (metadata.sampleId) {
      requireCondition(
        !input,
        400,
        "INVALID_INPUT",
        "Choose either a sample or an upload.",
      );
      requireCondition(
        (await samples()).some((s) => s.id === metadata.sampleId),
        400,
        "INVALID_SAMPLE",
        "Choose a listed sample.",
      );
      wav = await readFile(
        resolve(fixtureRoot(), "audio", metadata.sampleId + ".wav"),
      );
    } else if (input) {
      wav = (await validateAudio(input)).wav;
    }
    const id = randomUUID(),
      key = incidentKey(id),
      sk = sessionKey(session.uid),
      audioKey = `sessions/${session.uid}/${id}.wav`;
    const incident: Incident = {
      id,
      revision: 1,
      createdAt: new Date().toISOString(),
      expiresAt: session.expiresAt,
      analysisState: "pending",
      reviewState: "pending",
      simulationState: "not_started",
      analysisMode: config.mode,
      ...(metadata.reportText ? { reportText: metadata.reportText } : {}),
      ...(metadata.sourceLocation
        ? { sourceLocation: metadata.sourceLocation }
        : {}),
      ...(metadata.locationDescription
        ? { locationDescription: metadata.locationDescription }
        : {}),
    };
    // Reserve a bounded slot before writing audio. Recheck revocation on final persistence.
    await db.transact([sk], (docs) => {
      const s = assertSession(docs[sk]);
      requireCondition(
        s.incidentIds.length < 20,
        429,
        "SESSION_LIMIT",
        "This demo session has reached its 20-report limit.",
      );
      return {
        result: null,
        put: { [sk]: { ...s, incidentIds: [...s.incidentIds, id] } },
      };
    });
    try {
      if (wav) await audio.put(audioKey, wav);
      return await db.transact([sk, key], (docs) => {
        assertSession(docs[sk]);
        const record: IncidentRecord = {
          incident,
          ownerUid: session.uid,
          ...(wav ? { audioKey } : {}),
          ...(metadata.reportText ? { reportText: metadata.reportText } : {}),
          attempts: 0,
          history: [],
          decisions: {},
          ...(metadata.sampleId ? { sampleId: metadata.sampleId } : {}),
        };
        return { result: incident, put: { [key]: record } };
      });
    } catch (error) {
      await audio.remove(audioKey).catch(() => {});
      await db.transact([sk], (docs) => ({
        result: null,
        ...(docs[sk]
          ? {
              put: {
                [sk]: {
                  ...docs[sk],
                  incidentIds: docs[sk].incidentIds.filter(
                    (v: string) => v !== id,
                  ),
                },
              },
            }
          : {}),
      }));
      throw error;
    }
  }
  async record(session: Session, id: string) {
    return own(
      await this.deps.db.get<IncidentRecord>(incidentKey(id)),
      session,
    );
  }
  async get(session: Session, id: string) {
    await recoverConversation(this.deps.db, session, id);
    const key = incidentKey(id),
      sk = sessionKey(session.uid);
    return this.deps.db.transact([key, sk], (docs) => {
      const currentSession = assertSession(docs[sk]);
      const record = own(docs[key], currentSession);
      if (
        record.incident.analysisState === "processing" &&
        (!record.lease || record.lease.until <= Date.now())
      ) {
        // An interrupted worker must not leave a report permanently unreviewable.
        // Token matching prevents recovery from releasing a newer worker's lease.
        if (
          record.lease &&
          currentSession.activeLease?.token === record.lease.token
        )
          delete currentSession.activeLease;
        delete record.lease;
        record.incident = {
          ...record.incident,
          analysisState: "failed",
          failureCode: "ANALYSIS_INTERRUPTED",
          revision: record.incident.revision + 1,
        };
        return {
          result: incidentSchema.parse(record.incident),
          put: { [key]: record, [sk]: currentSession },
        };
      }
      return { result: incidentSchema.parse(record.incident) };
    });
  }
  async list(session: Session) {
    const rows = await Promise.all(
      session.incidentIds.map((id) =>
        this.deps.db.get<IncidentRecord>(incidentKey(id)),
      ),
    );
    const owned = rows.filter(
      (r): r is IncidentRecord =>
        !!r &&
        r.ownerUid === session.uid &&
        Date.parse(r.incident.expiresAt) > Date.now(),
    );
    return (
      await Promise.all(owned.map((r) => this.get(session, r.incident.id)))
    ).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async audio(session: Session, id: string) {
    const r = await this.record(session, id);
    requireCondition(r.audioKey, 404, "NO_AUDIO", "This is a text report.");
    return this.deps.audio.get(r.audioKey);
  }
  async history(session: Session, id: string) {
    return (await this.record(session, id)).history.map(
      ({ reviewerUid, ...event }) => event,
    );
  }
}
