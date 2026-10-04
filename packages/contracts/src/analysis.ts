import {z} from 'zod';
export const urgencySchema=z.enum(['urgent_review','standard_review','unclear']);
export const routingSchema=z.enum(['police','fire','medical','other','unclear']);
export const analysisSchema=z.strictObject({transcript:z.string().max(12000),facts:z.array(z.strictObject({text:z.string().trim().min(1).max(600),quote:z.string().max(600),evidenceStatus:z.enum(['matched','unverified'])})).max(20),unknowns:z.array(z.string().max(300)).max(20),urgency:urgencySchema,routing:routingSchema,explanation:z.string().max(1500)});
export type Urgency=z.infer<typeof urgencySchema>;
export type Routing=z.infer<typeof routingSchema>;
export type AnalysisBrief=z.infer<typeof analysisSchema>;
export function parseModelBrief(input:unknown):AnalysisBrief{const brief=analysisSchema.parse(input);return {...brief,facts:brief.facts.map(f=>({...f,evidenceStatus:f.quote.trim().length>0&&brief.transcript.includes(f.quote)?'matched':'unverified'}))}}
