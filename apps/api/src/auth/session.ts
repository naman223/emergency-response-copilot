import type { Database } from "../infra/repository";
import { AppError, requireCondition } from "../errors";
export type Session = {
  uid: string;
  expiresAt: string;
  revoked?: boolean;
  incidentIds: string[];
  activeLease?: { token: string; until: number };
  quota?: { hour: number; count: number };
};
export const sessionKey = (uid: string) => `session:${uid}`;
export async function authenticate(
  header: string | undefined,
  verify: (token: string) => Promise<string>,
) {
  if (!header?.startsWith("Bearer "))
    throw new AppError(401, "AUTH_REQUIRED", "Start a demo session first.");
  try {
    return await verify(header.slice(7));
  } catch {
    throw new AppError(
      401,
      "AUTH_REQUIRED",
      "Your session is not valid. Start again.",
    );
  }
}
export function assertSession(session: Session | undefined) {
  requireCondition(
    session && !session.revoked && Date.parse(session.expiresAt) > Date.now(),
    401,
    "SESSION_EXPIRED",
    "Your demo session has ended. Start a new session.",
  );
  return session;
}
export async function verifySession(db: Database, uid: string) {
  return assertSession(await db.get<Session>(sessionKey(uid)));
}
export async function startSession(db: Database, uid: string) {
  const key = sessionKey(uid);
  return db.transact([key], (docs) => {
    if (docs[key]) return { result: assertSession(docs[key]) };
    const session: Session = {
      uid,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      incidentIds: [],
    };
    return { result: session, put: { [key]: session } };
  });
}
