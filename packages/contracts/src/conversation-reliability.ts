export const MODEL_REQUEST_TIMEOUT_MS = 45_000;

export function conversationDeadlines(
  mode: "fixture" | "live",
  modelTimeout = MODEL_REQUEST_TIMEOUT_MS,
) {
  const generation = modelTimeout * (mode === "live" ? 2 : 1);
  return { generation, browser: generation + 15_000 };
}

export function conversationFailureMessage(code?: string) {
  const reasons: Record<string, string> = {
    CONVERSATION_TIMEOUT: "The AI assessment exceeded its time limit.",
    MODEL_TIMEOUT: "The AI service did not respond within its time limit.",
    BROWSER_TIMEOUT:
      "The response did not reach this browser within its time limit. Reload to check its saved status.",
    ASSESSMENT_REJECTED:
      "The AI assessment could not pass the report's evidence and consistency checks.",
    INVALID_RESPONSE: "The AI response had an invalid format.",
    INCOMPLETE_RESPONSE: "The AI response was incomplete.",
    MODEL_RATE_LIMITED: "The AI service is receiving too many requests.",
    MODEL_UNAVAILABLE: "The AI service is temporarily unavailable.",
    MODEL_CONFIGURATION:
      "The AI service could not accept this request. Check the server configuration.",
    MODEL_CONNECTION_FAILED: "The server could not connect to the AI service.",
    CONVERSATION_INTERRUPTED: "The response was interrupted.",
  };
  return `${reasons[code ?? ""] ?? "The response did not complete."} Your report is saved. Retry or review it manually.`;
}
