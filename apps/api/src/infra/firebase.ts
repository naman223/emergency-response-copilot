import {
  initializeApp,
  deleteApp,
  applicationDefault,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { randomUUID } from "node:crypto";
import type { Config } from "../config";
import type { Database, Documents, Change } from "./repository";
import type { AudioStore } from "./audio-store";
export function createFirebase(config: Config) {
  const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
  const app = initializeApp(
    {
      projectId: config.projectId,
      storageBucket: config.bucket,
      ...(!emulator ? { credential: applicationDefault() } : {}),
    },
    randomUUID(),
  );
  const firestore = getFirestore(app, config.databaseId);
  const records = firestore.collection("records");
  const ref = (key: string) => records.doc(encodeURIComponent(key));
  const db: Database = {
    async get<T>(key: string) {
      return (await ref(key).get()).data()?.value as T | undefined;
    },
    async list<T>(prefix: string) {
      const s = await records
        .where("key", ">=", prefix)
        .where("key", "<", prefix + "\uf8ff")
        .get();
      return s.docs.map((d) => ({
        key: d.data().key as string,
        value: d.data().value as T,
      }));
    },
    async transact<T>(keys: string[], change: (docs: Documents) => Change<T>) {
      return firestore.runTransaction(async (tx) => {
        const snaps = await tx.getAll(...[...new Set(keys)].map(ref));
        const docs = Object.fromEntries(
          snaps.map((d) => [decodeURIComponent(d.id), d.data()?.value]),
        );
        const out = change(docs);
        for (const [key, value] of Object.entries(out.put ?? {})) {
          if (!keys.includes(key))
            throw new Error("Transaction write was not declared");
          tx.set(ref(key), { key, value: JSON.parse(JSON.stringify(value)) });
        }
        for (const key of out.remove ?? []) tx.delete(ref(key));
        return out.result;
      });
    },
  };
  const bucket = getStorage(app).bucket();
  const audio: AudioStore = {
    async put(key, bytes) {
      await bucket.file(key).save(Buffer.from(bytes), {
        resumable: false,
        contentType: "audio/wav",
        metadata: { cacheControl: "private, no-store" },
      });
    },
    async get(key) {
      return (await bucket.file(key).download())[0];
    },
    async remove(key) {
      await bucket.file(key).delete({ ignoreNotFound: true });
    },
  };
  return {
    db,
    audio,
    verifyToken: async (token: string) =>
      (await getAuth(app).verifyIdToken(token)).uid,
    close: async () => {
      await firestore.terminate();
      await deleteApp(app);
    },
  };
}
