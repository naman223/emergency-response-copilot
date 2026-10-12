import { expect, it } from "vitest";
import { ApiError } from "@google/genai";
import { z } from "zod";
import { AppError } from "../src/errors";
import { RejectedConsistencyReview } from "../src/conversation/consistency-review";
import { conversationFailureCode } from "../src/conversation/failure";
import {
  conversationDeadlines,
  conversationFailureMessage,
} from "@copilot/contracts";

it.each([
  [new ApiError({ message: "private", status: 429 }), "MODEL_RATE_LIMITED"],
  [new ApiError({ message: "private", status: 503 }), "MODEL_UNAVAILABLE"],
  [new ApiError({ message: "private", status: 504 }), "MODEL_TIMEOUT"],
  [new ApiError({ message: "private", status: 403 }), "MODEL_CONFIGURATION"],
  [new DOMException("private", "AbortError"), "MODEL_TIMEOUT"],
  [
    new TypeError("private", { cause: { code: "ECONNRESET" } }),
    "MODEL_CONNECTION_FAILED",
  ],
  [
    new TypeError("private", { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } }),
    "MODEL_TIMEOUT",
  ],
  [new SyntaxError("private"), "INVALID_RESPONSE"],
  [z.string().safeParse(4).error!, "INVALID_RESPONSE"],
  [new RejectedConsistencyReview("private", {} as any), "ASSESSMENT_REJECTED"],
  [
    new AppError(504, "CONVERSATION_TIMEOUT", "private"),
    "CONVERSATION_TIMEOUT",
  ],
  [new Error("private"), "CONVERSATION_FAILED"],
])("classifies safe provider failures %#", (error, expected) => {
  expect(conversationFailureCode(error)).toBe(expected);
  expect(conversationFailureMessage(expected)).not.toContain("private");
  expect(conversationFailureMessage(expected)).toContain(
    "Your report is saved",
  );
});

it("gives the server its bounded model budget before the browser deadline", () => {
  expect(conversationDeadlines("live")).toEqual({
    generation: 90000,
    browser: 105000,
  });
  expect(conversationDeadlines("fixture")).toEqual({
    generation: 45000,
    browser: 60000,
  });
  expect(conversationDeadlines("live", 100).generation).toBe(200);
});
