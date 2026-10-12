import { requireCondition } from "../errors";
import type { Session } from "../auth/session";
import type { Documents } from "../infra/repository";
export function reserveInference(docs: Documents, key: string, now: number) {
  const session = structuredClone(docs[key]) as Session;
  const hour = Math.floor(now / 3600000);
  const quota =
    session.quota?.hour === hour ? session.quota : { hour, count: 0 };
  const global =
    docs["quota:global"]?.hour === hour
      ? docs["quota:global"]
      : { hour, count: 0 };
  requireCondition(
    quota.count < 30 && global.count < 100,
    429,
    "RATE_LIMIT",
    "Analysis capacity reached. Try again next hour.",
  );
  session.quota = { hour, count: quota.count + 1 };
  return { session, globalQuota: { hour, count: global.count + 1 } };
}
