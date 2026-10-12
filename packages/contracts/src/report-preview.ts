import { z } from "zod";

export const reportPreviewSchema = z.strictObject({
  transcript: z.string().trim().max(2000),
  locationDescription: z.string().trim().min(1).max(500).nullable(),
});
export type ReportPreview = z.infer<typeof reportPreviewSchema>;
