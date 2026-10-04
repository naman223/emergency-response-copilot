export interface AudioStore {
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}
