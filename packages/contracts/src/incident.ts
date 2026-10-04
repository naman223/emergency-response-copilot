import { z } from "zod";
import { analysisSchema, routingSchema, urgencySchema } from "./analysis";
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
  locationDescription: z.string().max(500),
  confirmedFields: z
    .array(z.enum(["summary", "urgency", "routing", "locationDescription"]))
    .max(4),
});
export const receiptSchema = z.strictObject({
  id: z.uuid(),
  incidentId: z.uuid(),
  approvedRevision: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  simulated: z.literal(true),
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
  brief: analysisSchema.optional(),
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
