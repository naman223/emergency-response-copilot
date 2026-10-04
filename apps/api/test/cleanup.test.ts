import { it, expect } from "vitest";
import { memory } from "./helpers";
import { startSession, verifySession } from "../src/auth/session";
import { IncidentService } from "../src/incidents/service";
import { createConfig } from "../src/config";
import { resetSession, cleanupExpired } from "../src/demo/cleanup";
it("revokes before physical deletion and retries a partial cleanup safely", async () => {
  const m = memory(),
    s = await startSession(m.db, "owner");
  await new IncidentService({ ...m, config: createConfig({}) }).create(s, {
    sampleId: "explicit-threat",
  });
  let fail = true;
  const audio = {
    ...m.audio,
    async remove(k: string) {
      if (fail) throw Error("storage down");
      await m.audio.remove(k);
    },
  };
  await expect(resetSession(m.db, audio, s.uid)).rejects.toThrow();
  await expect(verifySession(m.db, s.uid)).rejects.toMatchObject({
    status: 401,
  });
  expect(m.blobs.size).toBe(1);
  fail = false;
  await resetSession(m.db, audio, s.uid);
  await resetSession(m.db, audio, s.uid);
  expect(m.blobs.size).toBe(0);
});
it("expired sessions are inaccessible before cleanup deletes their objects", async () => {
  const m = memory(),
    s = await startSession(m.db, "expired");
  await new IncidentService({ ...m, config: createConfig({}) }).create(s, {
    sampleId: "explicit-threat",
  });
  m.docs["session:expired"].expiresAt = "2000-01-01T00:00:00Z";
  await expect(verifySession(m.db, s.uid)).rejects.toMatchObject({
    status: 401,
  });
  expect((await cleanupExpired(m.db, m.audio, new Date())).deleted).toBe(1);
  expect(m.blobs.size).toBe(0);
});
