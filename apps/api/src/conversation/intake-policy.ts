import type {
  CoordinatorResponse,
  ConversationAssessment,
} from "@copilot/contracts";
export type IntakePolicy = { questionsAsked: number; forceFinish: boolean };
export function applyIntakePolicy(
  response: CoordinatorResponse,
  policy: IntakePolicy,
  previous?: ConversationAssessment,
) {
  const assessment = response.assessment ?? previous;
  const ready =
    policy.forceFinish ||
    policy.questionsAsked >= 10 ||
    !response.question ||
    (policy.questionsAsked >= 5 && !response.clarificationReason?.trim());
  if (!ready) return { ready, response };
  const urgency =
    assessment?.urgency === "urgent_review"
      ? "Urgent review"
      : assessment?.urgency === "standard_review"
        ? "Standard review"
        : "Urgency remains unclear";
  return {
    ready,
    response: {
      ...response,
      question: null,
      suggestedReplies: [],
      clarificationReason: undefined,
      assessment: assessment ?? null,
      reply: assessment
        ? `Assessment ready. ${assessment.summary}\n\n${urgency}. Suggested responder: ${assessment.routing === "unclear" ? "human routing decision required" : assessment.routing}. ${assessment.unknowns.length ? "Unresolved details remain listed in the incident brief. " : ""}Review the assessment, confirm the incident location, and choose a service for the simulated handoff. No emergency service has been contacted.`
        : `Assessment ready for manual review. ${!response.question ? response.reply.slice(0, 3500) : "There is not enough reliable information to determine urgency or a responder."} Review the original report and record your decision. No emergency service has been contacted.`,
    },
  };
}
