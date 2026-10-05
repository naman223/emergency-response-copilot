import { z } from "zod";
import { urgencySchema, routingSchema } from "./analysis";
const uuid = z.uuid();
export const incidentIndicatorSchema = z.strictObject({
  status: z.enum(["yes", "no", "unknown"]),
  reason: z.string().trim().min(1).max(300),
});
export const incidentIndicatorsSchema = z.strictObject({
  emergency: incidentIndicatorSchema,
  police: incidentIndicatorSchema,
  medical: incidentIndicatorSchema,
  ambulance: incidentIndicatorSchema,
  fire: incidentIndicatorSchema,
  weapon: incidentIndicatorSchema,
  injuries: incidentIndicatorSchema,
  immediateDanger: incidentIndicatorSchema,
});
export const evidenceRefSchema = z
  .strictObject({
    source: z.enum(["transcript", "officer"]),
    messageId: uuid.optional(),
    quote: z.string().max(600),
  })
  .refine(
    (v) => v.source !== "officer" || !!v.messageId,
    "Officer evidence requires message ID",
  );
export const conversationAssessmentSchema = z.strictObject({
  summary: z.string().trim().min(1).max(2000),
  facts: z
    .array(
      z.strictObject({
        text: z.string().min(1).max(600),
        source: evidenceRefSchema,
        evidenceStatus: z.enum(["matched", "unverified"]),
      }),
    )
    .max(20),
  unknowns: z.array(z.string().max(300)).max(20),
  urgency: urgencySchema,
  routing: routingSchema,
  locationDescription: z.string().max(500),
  indicators: incidentIndicatorsSchema.optional(),
});
export const coordinatorResponseSchema = z.strictObject({
  reply: z.string().trim().min(1).max(4000),
  question: z.string().max(300).nullable(),
  suggestedReplies: z.array(z.string().max(200)).max(4),
  assessment: conversationAssessmentSchema.nullable(),
  transcript: z.string().max(12000).optional(),
  clarificationReason: z.string().trim().max(300).optional(),
});
const textCoordinatorResponseSchema = coordinatorResponseSchema.omit({
  transcript: true,
});
export function coordinatorModelResponseSchema(audioAttached: boolean) {
  return audioAttached
    ? coordinatorResponseSchema
    : textCoordinatorResponseSchema;
}
export const turnRequestSchema = z
  .strictObject({
    turnId: uuid,
    expectedRevision: z.number().int().positive(),
    kind: z.enum(["initial", "message", "finish"]),
    text: z.string().trim().min(1).max(2000).optional(),
  })
  .refine(
    (v) => (v.kind === "message" ? !!v.text : !v.text),
    "Message requires text; initial uses original report",
  );
export const retryTurnRequestSchema = z.strictObject({
  attemptId: uuid,
  expectedRevision: z.number().int().positive(),
});
export const conversationTurnSchema = z.strictObject({
  id: uuid,
  incidentId: uuid,
  kind: z.enum(["initial", "message", "finish"]),
  officerText: z.string().max(2000),
  state: z.enum([
    "pending",
    "processing",
    "completed",
    "failed",
    "interrupted",
  ]),
  attempts: z.number().int().min(0).max(3),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  reply: z.string().max(4000).optional(),
  question: z.string().max(300).nullable().optional(),
  suggestedReplies: z.array(z.string().max(200)).max(4).optional(),
  assessment: conversationAssessmentSchema.nullable().optional(),
  completedRevision: z.number().int().optional(),
  failureCode: z.string().optional(),
});
export type EvidenceRef = z.infer<typeof evidenceRefSchema>;
export type ConversationAssessment = z.infer<
  typeof conversationAssessmentSchema
>;
export type CoordinatorResponse = z.infer<typeof coordinatorResponseSchema>;
export type TurnRequest = z.infer<typeof turnRequestSchema>;
export type RetryTurnRequest = z.infer<typeof retryTurnRequestSchema>;
export type ConversationTurn = z.infer<typeof conversationTurnSchema>;
export type TurnState = ConversationTurn["state"];
export type ConversationSnapshot = {
  incident: import("./incident").Incident;
  turns: ConversationTurn[];
};
export type ConversationEvent = { turnId: string; sequence: number } & (
  | {
      type: "status";
      stage:
        | "receiving_report"
        | "analyzing_report"
        | "receiving_response"
        | "updating_context"
        | "waiting_for_reply";
    }
  | { type: "delta"; text: string }
  | { type: "completed"; snapshot: ConversationSnapshot }
  | { type: "failure"; code: string; message: string }
);
export function validateCoordinatorResponse(
  input: unknown,
  sources: { transcript?: string; messages: Record<string, string> },
  initialAudio: boolean,
): CoordinatorResponse {
  const r = coordinatorResponseSchema.parse(input);
  if (r.transcript !== undefined && !initialAudio)
    throw Error("Original transcript cannot be replaced");
  const transcript = initialAudio ? r.transcript : sources.transcript;
  if (r.assessment)
    r.assessment.facts = r.assessment.facts.map((f) => {
      const source =
        f.source.source === "transcript"
          ? transcript
          : sources.messages[f.source.messageId!];
      return {
        ...f,
        evidenceStatus:
          f.source.quote.trim() && source?.includes(f.source.quote)
            ? "matched"
            : "unverified",
      };
    });
  return r;
}
