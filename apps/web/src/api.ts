import { ensureUser } from "./firebase";
import { apiUrl } from "./api-origin";
export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const signal = init.signal;
  async function perform(): Promise<T> {
    signal?.throwIfAborted();
    const user = await ensureUser();
    signal?.throwIfAborted();
    const token = await user.getIdToken();
    signal?.throwIfAborted();
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (init.body && !(init.body instanceof FormData))
      headers.set("Content-Type", "application/json");
    const response = await fetch(apiUrl(path), { ...init, headers });
    if (!response.ok) {
      let message = "Request failed. Please retry.";
      try {
        message = (await response.json()).error.message;
      } catch {}
      throw new Error(message);
    }
    if (response.status === 204) return undefined as T;
    return response.json();
  }
  if (!signal) return perform();
  signal.throwIfAborted();
  // The deadline also covers Firebase auth and response decoding, which may
  // still be pending after fetch's signal has been cancelled.
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", abort);
    const abort = () => {
      cleanup();
      reject(
        signal.reason ?? new DOMException("Request cancelled", "AbortError"),
      );
    };
    signal.addEventListener("abort", abort, { once: true });
    perform().then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}
export async function audioUrl(id: string) {
  const user = await ensureUser();
  const response = await fetch(apiUrl(`/incidents/${id}/audio`), {
    headers: { Authorization: `Bearer ${await user.getIdToken()}` },
  });
  if (!response.ok) throw new Error("Recording unavailable.");
  return URL.createObjectURL(await response.blob());
}
