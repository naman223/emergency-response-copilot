import type { CoordinatorResponse } from "@copilot/contracts";
import type { ProviderInput } from "./provider";

export const sourceGroundingInstruction = `Preserve scope and causal meaning in reply, summary, facts and indicator reasons, including Hindi. A knife threat and a separately reported injury do not establish that the suspect caused the injury or that a knife attack occurred. State the threat and injury separately unless a current matched affirmative source explicitly establishes the cause for that person. Do not write caused/causing/resulting in/injury from, जिससे चोट आई, घायल किया, or चाकू से हमला merely from their co-occurrence. A cause reported for a visitor cannot be transferred to an employee. No injuries have been reported must stay no injuries reported, including in coordinated lists: no threats, injuries or dangers observed/present broadens that source. No breathing observed must not become lack of breathing, absence of breathing, not breathing or non-breathing. A clearly cited current confirmation may replace earlier uncertainty only for the same subject; an Unknown or withdrawn confirmation invalidates it. Do not infer a cause, assault, diagnosis or verified absence from a matching quote alone.`;

type CitedSentence = { text: string; turnIndex: number; end: number };
export const medicalRecommendationInstruction =
  "Medical and ambulance Yes are provisional service recommendations, not confirmed treatment or transport requirements. Reported unresponsiveness and no breathing observed can support urgent medical/ambulance review without establishing that the person requires urgent transport or life support. Say urgent ambulance response is suggested for medical assessment; treatment and transport needs require clinician assessment. Do not prescribe or speculate about specific treatments such as CPR, resuscitation, life support, intubation or defibrillation, including in questions, suggested replies, unknowns and indicator reasons. Never ask the officer to perform a medical procedure. An explicitly attributed clinician report may be retained verbatim only when a current matched source supports that complete statement for the same person; do not turn it into your own advice or transfer it to another person. Retain the original recording/transcript and urgent service indicators while correcting unsupported clinical wording.";

const sentencePattern = /[^.!?;।\n]+[.!?;।\n]?/g;
const uncertain =
  /[?]|\b(?:unknown whether|unsure|uncertain|unconfirmed|not sure|whether|if|cannot confirm|can't confirm|no evidence|no confirmation|not established|may|might|could|possible|suspected|did not|didn't|does not|has not|not caused)\b|अज्ञात|शायद|नहीं|क्या/iu;
const causeTopic =
  /\b(?:caus\w*|result\w*|attack\w*|stab\w*)\b|जिससे|घायल किया|हमल|चोट का कारण/iu;
const breathingTopic = /\bbreath\w*\b/i;
const observedBreathing =
  /\bno\b[^.!?;\n]*\bbreathing\b[^.!?;\n]*\bobserv\w*\b|\bbreathing\b[^.!?;\n]*\b(?:not|never) observed\b/i;
const definiteBreathing =
  /\b(?:lack|absence|cessation) of breathing\b|\b(?:not\s+|non[- ]?)breathing\b|\bbreathing (?:has |had )?stopped\b/i;
const clinicalTopic =
  /\b(?:transport\w*|transfer\w*|ambulance|medical (?:support|help|care|assistance|need\w*|response)|treatment|life[- ]support|cpr|chest compressions|resuscitation|intubation|defibrillation)\b/i;
const specificTreatment =
  "(?:life[- ]support|CPR|cardiopulmonary resuscitation|chest compressions|resuscitation|intubation|defibrillation)";
const treatmentDecision = new RegExp(
  String.raw`\b(?:requires?|needs?|must|should|consider|recommend\w*|do|perform|provide|start|begin|initiat\w*|administ\w*|give|benefit from)\b(?:\s+[\w'-]+){0,7}\s+` +
    specificTreatment +
    String.raw`\b|\b` +
    specificTreatment +
    String.raw`\s+(?:(?:is|are|may|might|could|be|urgently)\s+)*(?:required|needed|necessary|essential|indicated|recommended|suggested|advised)\b|\b` +
    specificTreatment +
    String.raw`\s+(?:should|must)\s+(?:be\s+)?(?:started|performed|provided|administered|initiated)\b`,
  "i",
);
const transportDecision =
  /\b(?:requires?|needs?)\s+(?:[\w'-]+\s+){0,5}(?:transport(?:ation)?|transfer)\b|\bmust\s+be\s+(?:[\w'-]+\s+){0,3}(?:transported|transferred)\b|\b(?:transport(?:ation)?|transfer)\s+(?:[\w'-]+\s+){0,3}(?:is|are)\s+(?:urgently\s+)?(?:required|needed|necessary)\b/i;

function medicalDecision(text: string, medicalContext: boolean) {
  if (treatmentDecision.test(text)) return true;
  if (
    !medicalContext &&
    !/\b(?:patient|medical|ambulance|hospital)\b/i.test(text)
  )
    return false;
  const transport = transportDecision.exec(text);
  return (
    !!transport &&
    !/\b(?:may|might|could)\s+(?:(?:[a-z]+ly|still|also|now)\s+){0,2}$/i.test(
      text.slice(0, transport.index),
    )
  );
}

function medicalRecommendationErrors(
  fields: Array<[string, string]>,
  cited: CitedSentence[],
  input: ProviderInput,
  medicalContext: boolean,
) {
  const normalize = (text: string) =>
    text
      .trim()
      .replace(/[.!?;।]+$/, "")
      .toLocaleLowerCase();
  const errors: string[] = [];
  for (const [path, field] of fields) {
    for (const match of field.matchAll(sentencePattern)) {
      const sentence = match[0];
      const decision = sentence
        .split(/,\s*|\s+but\s+/i)
        .some((clause) => medicalDecision(clause, medicalContext));
      if (!decision) continue;
      const attributed =
        /\b(?:doctor|clinician|paramedic|nurse|medical team)\b\s+(?:reports?|reported|says?|said|advised|instructed|requested|confirmed)\b/i.test(
          sentence,
        );
      const supported =
        attributed &&
        cited.some(
          (source) =>
            normalize(source.text) === normalize(sentence) &&
            currentClinicalCitation(source, input),
        );
      if (!supported)
        errors.push(
          "Unsupported medical recommendation in " +
            path +
            ". Suggest urgent services for clinician assessment without establishing treatment or transport requirements, prescribing specific treatment, or asking the officer to perform it. Preserve only current matched, verbatim attributed clinician reports.",
        );
    }
  }
  return errors;
}

// Uncertainty in a different clause does not qualify the causal/medical claim.
function clauses(text: string) {
  return [...text.matchAll(sentencePattern)].flatMap((sentence) =>
    sentence[0].split(
      /,\s*(?=(?:but|and|if|the|a|an)\b)|\s+(?:but|लेकिन)\s+|\s+और\s+(?=(?:एम्बुलेंस|वर्तमान|अभी|आग|खतरा))/iu,
    ),
  );
}

function matchedSentences(response: CoordinatorResponse, input: ProviderInput) {
  return response.assessment!.facts.flatMap((fact): CitedSentence[] => {
    if (fact.evidenceStatus !== "matched" || !fact.source.quote.trim())
      return [];
    const turnIndex =
      fact.source.source === "officer"
        ? input.turns.findIndex((turn) => turn.id === fact.source.messageId)
        : -1;
    const source =
      fact.source.source === "transcript"
        ? input.report.transcript
        : input.turns[turnIndex]?.officerText;
    if (!source) return [];
    const start = source.indexOf(fact.source.quote);
    if (start < 0) return [];
    const end = start + fact.source.quote.length;
    return [...source.matchAll(sentencePattern)]
      .filter(
        (match) => match.index < end && match.index + match[0].length > start,
      )
      .map((match) => ({
        text: match[0],
        turnIndex,
        end: match.index + match[0].length,
      }));
  });
}

function updateText(input: ProviderInput, index: number) {
  const text = input.turns[index].officerText;
  if (
    !/^(?:unknown|i do not know|i don't know|(?:i )?cannot confirm|(?:i )?can't confirm|अज्ञात)[.!।]?$/i.test(
      text.trim(),
    )
  )
    return text;
  const question = input.turns
    .slice(0, index)
    .reverse()
    .find((turn) => turn.state === "completed")?.question;
  return `${text}\n${question ?? ""}`;
}

function currentCitation(
  sentence: CitedSentence,
  input: ProviderInput,
  topic: RegExp,
) {
  return !input.turns.some(
    (turn, index) =>
      index > sentence.turnIndex &&
      !(
        sentence.turnIndex === -1 &&
        turn.kind === "initial" &&
        turn.officerText.trim() === input.report.transcript?.trim()
      ) &&
      clauses(updateText(input, index)).some(
        (update) =>
          topic.test(update) && sameSubject(sentence.text, update, topic),
      ),
  );
}

function clinicianReportWithdrawn(text: string) {
  return (
    /\b(?:doctor|clinician|paramedic|nurse|medical team|(?:that|this) (?:report|statement|advice|instruction))\b/i.test(
      text,
    ) &&
    /\b(?:withdrawn|retracted|unconfirmed|cannot confirm|can't confirm)\b/i.test(
      text,
    ) &&
    !/\b(?:not|never|hasn't|haven't)\s+(?:been\s+)?(?:withdrawn|retracted)\b/i.test(
      text,
    )
  );
}

function currentClinicalCitation(
  sentence: CitedSentence,
  input: ProviderInput,
) {
  if (!currentCitation(sentence, input, clinicalTopic)) return false;
  const relevant = (update: string) =>
    (clinicalTopic.test(update) || clinicianReportWithdrawn(update)) &&
    sameSubject(sentence.text, update, clinicalTopic);
  const source =
    sentence.turnIndex === -1
      ? input.report.transcript
      : input.turns[sentence.turnIndex]?.officerText;
  // A matched quotation can be withdrawn later in the same source message.
  if (source && clauses(source.slice(sentence.end)).some(relevant))
    return false;
  return !input.turns.some(
    (turn, index) =>
      index > sentence.turnIndex &&
      !(
        sentence.turnIndex === -1 &&
        turn.kind === "initial" &&
        turn.officerText.trim() === input.report.transcript?.trim()
      ) &&
      clauses(updateText(input, index)).some(
        (update) =>
          clinicianReportWithdrawn(update) &&
          sameSubject(sentence.text, update, clinicalTopic),
      ),
  );
}

// Narrow role aliases bind a cited cause to the reported participants rather
// than letting an unrelated visitor's fall justify a suspect injuring a worker.
function participants(text: string) {
  const aliases: Array<[string, RegExp]> = [
    [
      "suspect",
      /\b(?:suspect|robber|assailant|attacker|man)\b|संदिग्ध|व्यक्ति/iu,
    ],
    ["employee", /\b(?:employee|worker)\b|कर्मचारी/iu],
    ["visitor", /\b(?:visitor|guest)\b|आगंतुक/iu],
    ["fall", /\b(?:fall|slip)\b|गिरने/iu],
    ["person", /\b(?:person|patient)\b/iu],
  ];
  return aliases
    .flatMap(([role, pattern]) =>
      [...text.matchAll(new RegExp(pattern.source, pattern.flags + "g"))].map(
        (match) => ({ role, index: match.index }),
      ),
    )
    .sort((a, b) => a.index - b.index)
    .map((match) => match.role);
}

function injuryRelationship(text: string) {
  const forward = /\b(?:caused?|causing|result(?:ed|ing|s)? in)\b/i.exec(text);
  if (forward)
    if (/^\s+by\b/i.test(text.slice(forward.index + forward[0].length)))
      return {
        actor: participants(text.slice(forward.index + forward[0].length))[0],
        victim: participants(text.slice(0, forward.index)).at(-1),
      };
  if (forward)
    return {
      actor: participants(text.slice(0, forward.index)).at(-1),
      victim: participants(text.slice(forward.index + forward[0].length))[0],
    };
  const reverse = /\b(?:from|by|because of|due to)\b/i.exec(text);
  if (reverse)
    return {
      actor: participants(text.slice(reverse.index + reverse[0].length))[0],
      victim: participants(text.slice(0, reverse.index)).at(-1),
    };
  return undefined;
}

function breathingSubject(text: string) {
  const assertion = definiteBreathing.exec(text) ?? breathingTopic.exec(text);
  return assertion
    ? (participants(text.slice(0, assertion.index)).at(-1) ??
        participants(text.slice(assertion.index))[0])
    : undefined;
}

function sameSubject(source: string, update: string, topic: RegExp) {
  if (topic === breathingTopic) {
    const subject = breathingSubject(source),
      updated = breathingSubject(update);
    return !subject || !updated || subject === updated;
  }
  const original = injuryRelationship(source),
    revised = injuryRelationship(update);
  const victim =
    original?.victim ??
    participants(source)
      .filter((role) => role !== "suspect" && role !== "fall")
      .at(-1);
  const updatedVictim =
    revised?.victim ??
    participants(update)
      .filter((role) => role !== "suspect" && role !== "fall")
      .at(-1);
  if (victim && updatedVictim) return victim === updatedVictim;
  return (
    !original?.actor || !revised?.actor || original.actor === revised.actor
  );
}

function causalClaims(text: string) {
  const injury = /\b(?:injur\w*|wounds?|hurt)\b|चोट|घायल|जख्म/iu;
  return clauses(text).flatMap((sentence) => {
    if (uncertain.test(sentence)) return [];
    const attack = /चाकू से हमल/iu.test(sentence);
    const cause =
      injury.test(sentence) &&
      (/\b(?:caused?|causing|result(?:ed|ing|s)? in)\b[^.!?;\n]{0,120}\b(?:injur\w*|wounds?|hurt)\b/i.test(
        sentence,
      ) ||
        /\b(?:injur\w*|wounds?|hurt)\b[^.!?;\n]{0,50}\b(?:from|by|because of|due to)\b/i.test(
          sentence,
        ) ||
        /जिससे[^।.!?\n]{0,100}(?:चोट|घायल)|घायल\s+(?:किया|कर)/u.test(sentence));
    return cause || attack
      ? [
          {
            text: sentence,
            kind: attack ? "attack" : "cause",
            relationship: injuryRelationship(sentence),
          },
        ]
      : [];
  });
}

export function sourceGroundingErrors(
  response: CoordinatorResponse,
  input: ProviderInput,
  fields: Array<[string, string]>,
) {
  const errors: string[] = [];
  const sentences = matchedSentences(response, input);
  errors.push(
    ...medicalRecommendationErrors(
      fields,
      sentences,
      input,
      response.assessment?.indicators?.medical.status === "yes" ||
        response.assessment?.indicators?.ambulance.status === "yes",
    ),
  );
  const cited = sentences.flatMap((sentence) =>
    clauses(sentence.text).map((text) => ({ ...sentence, text })),
  );
  const causes = cited
    .filter((sentence) => currentCitation(sentence, input, causeTopic))
    .flatMap((sentence) => causalClaims(sentence.text));
  const sources = [
    input.report.text,
    input.report.transcript,
    ...input.turns.map((turn) => turn.officerText),
  ].filter((text): text is string => !!text);
  const hasBreathingObservation = sources.some((source) =>
    observedBreathing.test(source),
  );
  const confirmedBreathingAbsence = cited.filter(
    (sentence) =>
      currentCitation(sentence, input, breathingTopic) &&
      !uncertain.test(sentence.text) &&
      definiteBreathing.test(sentence.text),
  );
  for (const [path, field] of fields) {
    for (const claim of causalClaims(field)) {
      const normalized = (text: string) =>
        text
          .trim()
          .replace(/[.!?;।]+$/, "")
          .toLocaleLowerCase();
      const supported = causes.some(
        (source) =>
          source.kind === claim.kind &&
          (normalized(source.text) === normalized(claim.text) ||
            (claim.relationship?.actor &&
              claim.relationship?.victim &&
              source.relationship?.actor === claim.relationship.actor &&
              source.relationship?.victim === claim.relationship.victim)),
      );
      if (!supported)
        errors.push(
          `Unsupported injury cause or attack in ${path}. Separate the reported threat and injury; do not attribute an injury to a suspect or event without a current matched affirmative source describing that relationship. Preserve this distinction in Hindi too.`,
        );
    }
    if (hasBreathingObservation)
      for (const sentence of clauses(field))
        if (
          definiteBreathing.test(sentence) &&
          !uncertain.test(sentence) &&
          !confirmedBreathingAbsence.some((source) => {
            const subject = breathingSubject(sentence);
            const sourceSubject = breathingSubject(source.text);
            return (
              sentence.trim() === source.text.trim() ||
              (!!subject && subject === sourceSubject)
            );
          })
        )
          errors.push(
            `Breathing observation qualifier lost in ${path}. No breathing observed does not establish lack of breathing, not breathing, or a diagnosis; retain no breathing observed in this field.`,
          );
  }
  return errors;
}
