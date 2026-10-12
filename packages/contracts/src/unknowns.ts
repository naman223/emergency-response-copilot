import type { ConversationAssessment } from "./conversation";

type IndicatorKey = keyof NonNullable<ConversationAssessment["indicators"]>;
const labels: Record<IndicatorKey, string> = {
  emergency: "Emergency response need",
  police: "Police response need",
  medical: "Medical support need",
  ambulance: "Ambulance need",
  fire: "Fire response need",
  weapon: "Weapon reported",
  injuries: "Injuries reported",
  immediateDanger: "Current immediate danger",
};

function gapKey(text: string) {
  let key = text
    .trim()
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/\.$/, "");
  // Compare wording wrappers, not topic similarity. Keep subjects, qualifiers,
  // conjunctions and negation; a conditional or question is not a status claim.
  if (!/^(?:if|unless|when)\b/.test(key)) {
    key = key
      .replace(/^it is (?:currently )?unknown (?=whether\b)/, "")
      .replace(/ (?:is|are|remains) (?:reported as )?unknown$/, "")
      .replace(/: unknown$/, "");
  }
  return key === "current immediate danger status"
    ? "current immediate danger"
    : key;
}

export function reconcileUnknowns(assessment: ConversationAssessment) {
  const indicators = assessment.indicators;
  const generatedKeys = new Set<string>();
  const gaps: string[] = [];
  if (indicators)
    for (const key of Object.keys(labels) as IndicatorKey[]) {
      generatedKeys.add(gapKey(labels[key]));
      if (indicators[key].status === "unknown")
        gaps.push(`${labels[key]}: Unknown`);
    }
  const acceptedUnknowns = assessment.facts
    .filter(
      (fact) =>
        fact.evidenceStatus === "matched" &&
        fact.source.quote.trim().toLowerCase() === "unknown",
    )
    .map((fact) => fact.text.slice(0, 300));
  const unique = new Map<string, string>();
  // Prefer stable indicator labels, then accepted answers, then free-form gaps.
  // Facts and exact source quotes are never altered or removed by this cleanup.
  for (const gap of [
    ...gaps,
    ...acceptedUnknowns,
    ...assessment.unknowns.filter((gap) => !generatedKeys.has(gapKey(gap))),
  ]) {
    const text = gap.trim();
    if (text && !unique.has(gapKey(text))) unique.set(gapKey(text), text);
  }
  return [...unique.values()];
}
