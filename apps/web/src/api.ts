import { ensureUser } from "./firebase";
export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const user = await ensureUser();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${await user.getIdToken()}`);
  if (init.body && !(init.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const response = await fetch("/api" + path, { ...init, headers });
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
export async function audioUrl(id: string) {
  const user = await ensureUser();
  const response = await fetch(`/api/incidents/${id}/audio`, {
    headers: { Authorization: `Bearer ${await user.getIdToken()}` },
  });
  if (!response.ok) throw new Error("Recording unavailable.");
  return URL.createObjectURL(await response.blob());
}
