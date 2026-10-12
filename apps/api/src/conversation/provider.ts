import type {
  ConversationAssessment,
  ConversationTurn,
} from "@copilot/contracts";
export type ProviderInput = {
  report: {
    text?: string;
    transcript?: string;
    wav?: Uint8Array;
    locationDescription?: string;
    sourceLocation?: import("@copilot/contracts").SourceLocation;
  };
  turns: ConversationTurn[];
  assessment?: ConversationAssessment;
  sampleId?: string;
  signal: AbortSignal;
  intake?: import("./intake-policy").IntakePolicy;
};
export type ProviderChunk =
  { type: "delta"; text: string } | { type: "result"; response: unknown };
export interface ConversationProvider {
  generate(input: ProviderInput): AsyncIterable<ProviderChunk>;
}
