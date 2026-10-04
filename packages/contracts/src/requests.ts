import { z } from "zod";
import { reviewDraftSchema, sourceLocationSchema } from "./incident";
export const decisionSchema = z.strictObject({
  expectedRevision: z.number().int().positive(),
  action: z.enum(["approve", "needs_clarification", "close"]),
  reason: z.string().trim().min(1).max(1000),
  idempotencyKey: z
    .string()
    .min(8)
    .max(100)
    .regex(/^[\w-]+$/),
});
export const editSchema = z.strictObject({
  expectedRevision: z.number().int().positive(),
  draft: reviewDraftSchema,
});
export const intakeSchema = z.strictObject({
  sampleId: z.string().max(100).optional(),
  sourceLocation: sourceLocationSchema.optional(),
  locationDescription: z.string().max(500).optional(),
});
export type DecisionRequest = z.infer<typeof decisionSchema>;
export type IntakeRequest = z.infer<typeof intakeSchema>;
