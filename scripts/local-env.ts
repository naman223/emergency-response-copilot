export function localEnvironment(
  env: NodeJS.ProcessEnv,
  live: boolean,
): NodeJS.ProcessEnv {
  const project = env.GEMINI_PROJECT_ID?.trim();
  if (
    live &&
    (!project || project.startsWith("demo-") || !env.GEMINI_MODEL?.trim())
  ) {
    throw new Error(
      "Live local mode requires a real GEMINI_PROJECT_ID and GEMINI_MODEL in .env.live.",
    );
  }
  return {
    ...env,
    ANALYSIS_MODE: live ? "live" : "fixture",
    GEMINI_PROJECT_ID: project,
    GOOGLE_CLOUD_PROJECT: "demo-emergency-copilot",
    GCLOUD_PROJECT: "demo-emergency-copilot",
    STORAGE_BUCKET: "demo-emergency-copilot.appspot.com",
    VITE_USE_EMULATORS: "true",
    VITE_FIREBASE_PROJECT_ID: "demo-emergency-copilot",
    VITE_FIREBASE_API_KEY: "demo-key",
    VITE_FIREBASE_AUTH_DOMAIN: "demo-emergency-copilot.firebaseapp.com",
    ALLOWED_ORIGIN: "http://127.0.0.1:5173",
  };
}
