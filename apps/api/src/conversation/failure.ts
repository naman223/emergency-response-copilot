import { ZodError } from "zod";
import { AppError } from "../errors";
import { RejectedConsistencyReview } from "./consistency-review";

// Persist only safe categories; provider errors may contain report text or URLs.
export function conversationFailureCode(error: unknown): string {
  if (error instanceof AppError) return error.code;
  if (error instanceof RejectedConsistencyReview) return "ASSESSMENT_REJECTED";
  if (error instanceof ZodError || error instanceof SyntaxError)
    return "INVALID_RESPONSE";
  if (error instanceof Error && error.name === "AbortError")
    return "MODEL_TIMEOUT";
  const value = error as {
    status?: unknown;
    cause?: { code?: unknown };
    code?: unknown;
  } | null;
  const status = value?.status;
  if (status === 429) return "MODEL_RATE_LIMITED";
  if (status === 408 || status === 504) return "MODEL_TIMEOUT";
  if (typeof status === "number" && status >= 500 && status <= 599)
    return "MODEL_UNAVAILABLE";
  if ([400, 401, 403, 404].includes(status as number))
    return "MODEL_CONFIGURATION";
  const code = value?.cause?.code ?? value?.code;
  if (
    [
      "ETIMEDOUT",
      "UND_ERR_CONNECT_TIMEOUT",
      "UND_ERR_HEADERS_TIMEOUT",
      "UND_ERR_BODY_TIMEOUT",
    ].includes(code as string)
  )
    return "MODEL_TIMEOUT";
  if (
    [
      "ECONNRESET",
      "ENOTFOUND",
      "ECONNREFUSED",
      "EAI_AGAIN",
      "UND_ERR_SOCKET",
    ].includes(code as string)
  )
    return "MODEL_CONNECTION_FAILED";
  return "CONVERSATION_FAILED";
}
