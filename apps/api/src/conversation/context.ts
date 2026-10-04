import type { ProviderInput } from "./provider";
export function buildConversationContext(input: ProviderInput) {
  const context = {
    intake: input.intake,
    originalReport: input.report.text,
    originalTranscript: input.report.transcript,
    assessment: input.assessment,
    messages: input.turns.map((t) => ({
      id: t.id,
      officer: t.officerText,
      coordinator: t.state === "completed" ? t.reply : undefined,
    })),
  };
  const text = JSON.stringify(context);
  if (Buffer.byteLength(text) > 65536) throw Error("Context limit");
  return text;
}
