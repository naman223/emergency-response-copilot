import { assertSession, sessionKey, type Session } from "../auth/session";
import { own, incidentKey, type IncidentRecord } from "../incidents/service";
import type { Database } from "../infra/repository";
export const turnKey = (incidentId: string, id: string) =>
  `turn:${incidentId}:${id}`;
export async function recoverConversation(
  db: Database,
  session: Session,
  id: string,
) {
  const key = incidentKey(id),
    sk = sessionKey(session.uid);
  const before = own(await db.get<IncidentRecord>(key), session);
  if (!before.activeTurnId) return;
  const tk = turnKey(id, before.activeTurnId);
  await db.transact([key, sk, tk], (docs) => {
    const s = assertSession(docs[sk]),
      r = own(docs[key], s);
    if (
      r.activeTurnId !== before.activeTurnId ||
      (r.lease && r.lease.until > Date.now())
    )
      return { result: null };
    const turn = docs[tk];
    if (r.lease && s.activeLease?.token === r.lease.token) delete s.activeLease;
    delete r.lease;
    delete r.activeTurnId;
    r.incident = {
      ...r.incident,
      analysisState: "failed",
      failureCode: "CONVERSATION_INTERRUPTED",
      revision: r.incident.revision + 1,
    };
    if (turn) {
      const finishedAt = new Date().toISOString();
      if (
        !turn.turn.attemptHistory?.some(
          (h: { attempt: number }) => h.attempt === turn.turn.attempts,
        )
      ) {
        turn.turn.attemptHistory = [
          ...(turn.turn.attemptHistory ?? []),
          {
            attempt: turn.turn.attempts,
            state: "interrupted",
            startedAt: turn.turn.updatedAt,
            finishedAt,
            durationMs: Math.max(
              0,
              Date.parse(finishedAt) - Date.parse(turn.turn.updatedAt),
            ),
            failureCode: "CONVERSATION_INTERRUPTED",
          },
        ];
      }
      turn.turn.state = "interrupted";
      turn.turn.failureCode = "CONVERSATION_INTERRUPTED";
      turn.turn.updatedAt = finishedAt;
    }
    return {
      result: null,
      put: { [key]: r, [sk]: s, ...(turn ? { [tk]: turn } : {}) },
    };
  });
}
