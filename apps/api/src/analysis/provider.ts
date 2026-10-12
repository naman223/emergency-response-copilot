export interface AnalysisProvider {
  analyze(input: { wav: Uint8Array; signal: AbortSignal }): Promise<unknown>;
}
