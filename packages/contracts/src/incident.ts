import { conversationAssessmentSchema } from "./conversation";
import { z } from "zod";
import { analysisSchema, routingSchema, urgencySchema } from "./analysis";
import { serviceSelectionsSchema, simulatedSmsSchema } from "./services";
export const sourceLocationSchema = z.strictObject({
  source: z.enum(["device", "sample"]),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().nonnegative().optional(),
  capturedAt: z.iso.datetime(),
});
export const reviewDraftSchema = z.strictObject({
  summary: z.string().trim().min(1).max(2000),
  urgency: urgencySchema,
  routing: routingSchema,
  services: serviceSelectionsSchema.optional(),
  locationDescription: z.string().max(500),
  confirmedFields: z
    .array(z.enum(["summary", "urgency", "routing", "locationDescription"]))
    .max(4),
  destinationName: z.string().trim().max(300).optional(),
  editedFields: z
    .array(
      z.enum([
        "summary",
        "urgency",
        "routing",
        "locationDescription",
        "services",
      ]),
    )
    .max(5)
    .optional(),
  selectedLocation: z
    .strictObject({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      source: z.literal("map"),
      selectedAt: z.iso.datetime(),
    })
    .optional(),
});
export const receiptSchema = z.strictObject({
  id: z.uuid(),
  incidentId: z.uuid(),
  approvedRevision: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  simulated: z.literal(true),
  smsMessages: z.array(simulatedSmsSchema).max(4).optional(),
});
export const incidentSchema = z.strictObject({
  id: z.uuid(),
  revision: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  analysisState: z.enum(["pending", "processing", "ready", "failed"]),
  reviewState: z.enum(["pending", "needs_clarification", "approved", "closed"]),
  simulationState: z.enum(["not_started", "completed", "failed"]),
  analysisMode: z.enum(["fixture", "live"]),
  sourceLocation: sourceLocationSchema.optional(),
  locationDescription: z.string().max(500).optional(),
  reportText: z.string().max(2000).optional(),
  clarifications: z
    .array(
      z.strictObject({
        turnId: z.uuid(),
        question: z.string().max(300).nullable(),
        answer: z.string().max(2000),
        createdAt: z.iso.datetime(),
        assessmentState: z.enum(["included", "unassessed"]),
      }),
    )
    .max(20)
    .optional(),
  brief: analysisSchema.optional(),
  assessment: conversationAssessmentSchema.optional(),
  sourceTranscript: z.string().max(12000).optional(),
  contextVersion: z.number().int().nonnegative().optional(),
  reviewContextVersion: z.number().int().nonnegative().optional(),
  intakeState: z.enum(["clarifying", "ready"]).optional(),
  clarificationCount: z.number().int().min(0).max(10).optional(),
  reviewDraft: reviewDraftSchema.optional(),
  failureCode: z.string().optional(),
  dispatchReceipt: receiptSchema.optional(),
});
export type SourceLocation = z.infer<typeof sourceLocationSchema>;
export type ReviewDraft = z.infer<typeof reviewDraftSchema>;
export type Incident = z.infer<typeof incidentSchema>;
export type AnalysisState = Incident["analysisState"];
export type ReviewState = Incident["reviewState"];
export type SimulationState = Incident["simulationState"];
export type DispatchReceipt = z.infer<typeof receiptSchema>;
