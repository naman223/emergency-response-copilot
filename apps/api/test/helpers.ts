import type { Database, Documents } from "../src/infra/repository";
import type { AudioStore } from "../src/infra/audio-store";
export function memory() {
  const docs: Documents = {};
  const blobs = new Map<string, Buffer>();
  let tail = Promise.resolve();
  const db: Database = {
    async get(k) {
      return structuredClone(docs[k]);
    },
    async list(prefix) {
      return Object.entries(docs)
        .filter(([k]) => k.startsWith(prefix))
        .map(([key, value]) => ({ key, value: structuredClone(value) }));
    },
    async transact(keys, fn) {
      const previous = tail;
      let release!: () => void;
      tail = new Promise((r) => (release = r));
      await previous;
      try {
        const out = fn(
          Object.fromEntries(keys.map((k) => [k, structuredClone(docs[k])])),
        );
        Object.assign(docs, structuredClone(out.put ?? {}));
        for (const k of out.remove ?? []) delete docs[k];
        return out.result;
      } finally {
        release();
      }
    },
  };
  const audio: AudioStore = {
    async put(k, v) {
      blobs.set(k, Buffer.from(v));
    },
    async get(k) {
      if (!blobs.has(k)) throw new Error("missing");
      return blobs.get(k)!;
    },
    async remove(k) {
      blobs.delete(k);
    },
  };
  return { db, audio, docs, blobs };
}
