import { createFirebase } from "../../apps/api/src/infra/firebase";
import { createConfig } from "../../apps/api/src/config";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8180";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIREBASE_STORAGE_EMULATOR_HOST = "127.0.0.1:9199";
const f = createFirebase(
  createConfig({ GOOGLE_CLOUD_PROJECT: "demo-emergency-copilot" }),
);
try {
  const key = `incident:${process.argv[2]}`;
  const r: any = await f.db.get(key);
  const sk = `session:${r.ownerUid}`;
  const tid = r.turnIds.at(-1),
    tk = `turn:${r.incident.id}:${tid}`;
  await f.db.transact([key, sk, tk], (d) => ({
    result: null,
    put: {
      [tk]: {
        ...d[tk],
        turn: { ...d[tk].turn, state: "processing", attempts: 3 },
      },
      [key]: {
        ...d[key],
        attempts: 3,
        activeTurnId: tid,
        lease: { token: "interrupted", until: Date.now() - 1000 },
        incident: {
          ...d[key].incident,
          analysisState: "processing",
          revision: d[key].incident.revision + 1,
        },
      },
      [sk]: {
        ...d[sk],
        activeLease: { token: "interrupted", until: Date.now() - 1000 },
      },
    },
  }));
} finally {
  await f.close();
}
