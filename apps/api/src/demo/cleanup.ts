import type { Database } from "../infra/repository";
import type { AudioStore } from "../infra/audio-store";
import { sessionKey, type Session } from "../auth/session";
import { incidentKey, type IncidentRecord } from "../incidents/service";
export async function resetSession(
  db: Database,
  audio: AudioStore,
  uid: string,
) {
  const sk = sessionKey(uid);
  const session = await db.transact([sk], (docs) => ({
    result: docs[sk] as Session | undefined,
    ...(docs[sk] ? { put: { [sk]: { ...docs[sk], revoked: true } } } : {}),
  }));
  if (!session) return;
  for (const id of session.incidentIds) {
    const key = incidentKey(id),
      record = await db.get<IncidentRecord>(key);
    if (record) {
      await audio.remove(record.audioKey);
      await db.transact([key], () => ({ result: null, remove: [key] }));
    }
  }
  await db.transact([sk], (docs) => ({
    result: null,
    put: { [sk]: { ...docs[sk], incidentIds: [], revoked: true } },
  }));
}
export async function cleanupExpired(
  db: Database,
  audio: AudioStore,
  now: Date,
) {
  let deleted = 0,
    failed = 0;
  for (const { value: session } of await db.list<Session>("session:")) {
    if (session.revoked || Date.parse(session.expiresAt) <= now.getTime()) {
      try {
        await resetSession(db, audio, session.uid);
        deleted++;
      } catch {
        failed++;
      }
    }
  }
  return { deleted, failed };
}
