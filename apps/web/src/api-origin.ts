/** Cloud calls bypass Hosting's 60-second proxy limit; local calls use Vite. */
export function apiUrl(path: string): string {
  const origin = (import.meta.env.VITE_API_ORIGIN ?? "")
    .trim()
    .replace(/\/+$/, "");
  return `${origin}/api${path}`;
}
