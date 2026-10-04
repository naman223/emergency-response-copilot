export function createConfig(env: NodeJS.ProcessEnv = process.env) {
  const cloud = !!env.K_SERVICE || !!env.CLOUD_RUN_JOB;
  const mode = env.ANALYSIS_MODE ?? "fixture";
  if (!["fixture", "live"].includes(mode))
    throw new Error("Invalid ANALYSIS_MODE");
  if (
    cloud &&
    Object.entries(env).some(([k, v]) => k.includes("EMULATOR") && v)
  )
    throw new Error("Emulators are forbidden on Cloud Run");
  if (mode === "live" && (!env.GOOGLE_CLOUD_PROJECT || !env.GEMINI_MODEL))
    throw new Error("Live mode requires GOOGLE_CLOUD_PROJECT and GEMINI_MODEL");
  if (cloud && mode === "fixture" && env.ALLOW_CLOUD_FIXTURES !== "true")
    throw new Error("Cloud fixtures require explicit opt-in");
  if (cloud && !env.ALLOWED_ORIGIN)
    throw new Error("Cloud requires ALLOWED_ORIGIN");
  const projectId = env.GOOGLE_CLOUD_PROJECT ?? "demo-emergency-copilot";
  return {
    cloud,
    mode: mode as "fixture" | "live",
    projectId,
    bucket: env.STORAGE_BUCKET ?? `${projectId}.appspot.com`,
    location: env.GOOGLE_CLOUD_LOCATION ?? "global",
    model: env.GEMINI_MODEL ?? "",
    origin: env.ALLOWED_ORIGIN ?? "http://127.0.0.1:5173",
    port: Number(env.PORT ?? 8181),
    analysisTimeout: 45000,
    sessionHours: 24,
  };
}
export type Config = ReturnType<typeof createConfig>;
