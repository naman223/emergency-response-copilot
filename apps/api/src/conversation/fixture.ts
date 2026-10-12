import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  CoordinatorResponse,
  ConversationAssessment,
} from "@copilot/contracts";
import { fixtureRoot, samples } from "../incidents/service";
import type {
  ConversationProvider,
  ProviderInput,
  ProviderChunk,
} from "./provider";
type Action = "initial" | "location" | "followup" | "why" | "unsupported";
type Answer = { value: string | null; messageId: string; quote: string };
export class FixtureConversationProvider implements ConversationProvider {
  constructor(private delay = 35) {}
  async *generate(input: ProviderInput): AsyncIterable<ProviderChunk> {
    const latest = input.turns.at(-1)!;
    let response: CoordinatorResponse;
    if (
      !input.sampleId ||
      !(await samples()).some((s) => s.id === input.sampleId)
    ) {
      response = {
        reply:
          "Your report is saved. This local demo uses scripted sample conversations, so I cannot interpret this report with AI yet. You can review it manually, or start one of the five sample conversations. Live Gemini will support free-form reports once connected.",
        question: null,
        suggestedReplies: [],
        assessment: null,
      };
    } else {
      const script = JSON.parse(
        await readFile(
          resolve(fixtureRoot(), "conversations", input.sampleId + ".json"),
          "utf8",
        ),
      );
      let location: Answer | undefined,
        followup: Answer | undefined,
        lastTarget: "location" | "followup" | undefined;
      let latestAction: Action = "initial";
      // Rebuild active facts from ordered officer statements. Prior messages remain immutable.
      for (const turn of input.turns) {
        if (turn.kind === "initial") continue;
        const text = turn.officerText.trim();
        let action: Action = "unsupported";
        const explicitLocation = [
          "University campus, beside the library",
          "North gate of the campus",
        ].includes(text)
          ? text
          : /^(Location:|Correction:)\s*/i.test(text)
            ? text.replace(/^(Location:|Correction:)\s*/i, "").trim()
            : undefined;
        if (explicitLocation && explicitLocation.length <= 500) {
          location = {
            value: explicitLocation,
            messageId: turn.id,
            quote: text,
          };
          lastTarget = "location";
          action = "location";
        } else if (text === "Why this recommendation?") action = "why";
        else if (text === "Unknown" || text === "I cannot confirm") {
          const target = !location
            ? "location"
            : !followup
              ? "followup"
              : lastTarget;
          if (target) {
            const answer = { value: null, messageId: turn.id, quote: text };
            if (target === "location") location = answer;
            else followup = answer;
            lastTarget = target;
            action = target;
          }
        } else if (script.answers.includes(text)) {
          followup = { value: text, messageId: turn.id, quote: text };
          lastTarget = "followup";
          action = "followup";
        }
        if (turn.id === latest.id) latestAction = action;
      }
      const question = !location
        ? script.question
        : !followup
          ? script.followup
          : null;
      const suggestedReplies =
        question === script.question
          ? ["University campus, beside the library", "Unknown"]
          : question === script.followup
            ? script.answers
            : [
                "Why this recommendation?",
                "Correction: the south gate, beside the library",
              ];
      const a: ConversationAssessment = structuredClone(script.assessment);
      if (a.indicators && followup?.value) {
        if (followup.value === "No injuries reported") {
          a.indicators.injuries = {
            status: "no",
            reason: "The officer reports no injuries.",
          };
        } else if (followup.value === "Injuries reported") {
          a.indicators.injuries = {
            status: "yes",
            reason: "The officer reports injuries.",
          };
          a.indicators.medical = {
            status: "yes",
            reason:
              "Reported injuries suggest medical support for human review.",
          };
        }
      }
      a.locationDescription = location?.value ?? "";
      a.unknowns = [
        ...(!location?.value ? ["Exact location unknown"] : []),
        ...(!followup?.value ? [script.assessment.unknowns[1]] : []),
      ];
      if (location?.value)
        a.facts.push({
          text: `Officer-reported location: ${location.value}`,
          source: {
            source: "officer",
            messageId: location.messageId,
            quote: location.quote,
          },
          evidenceStatus: "unverified",
        });
      if (followup?.value)
        a.facts.push({
          text: `Officer update: ${followup.value}`,
          source: {
            source: "officer",
            messageId: followup.messageId,
            quote: followup.quote,
          },
          evidenceStatus: "unverified",
        });
      const everThreat = input.turns.some(
        (t) => t.officerText === "A person is being threatened",
      );
      if (everThreat && followup?.value !== "Equipment enquiry only") {
        a.urgency = "urgent_review";
        a.routing = "police";
      }
      a.summary = [
        script.summaryBase,
        location?.value
          ? `Officer-reported location: ${location.value}.`
          : "Exact location unknown.",
        followup?.value
          ? `Officer update: ${followup.value}.`
          : `${script.assessment.unknowns[1]}.`,
      ].join(" ");
      const next =
        question ??
        "The incident brief is ready for your review. You can correct the location, ask why I suggested this response, or open Review and decide. No emergency service has been contacted.";
      if (latest.kind === "initial")
        response = {
          reply: `Received. ${script.opening} ${next}`,
          question,
          suggestedReplies,
          assessment: a,
          transcript: script.transcript,
        };
      else if (latestAction === "why")
        response = {
          reply: `${a.summary} This suggestion is based on reported content, not the speaker's emotional tone. It remains subject to your human review. ${question ?? "No additional question is pending; unresolved information remains visible in the incident brief."}`,
          question,
          suggestedReplies,
          assessment: null,
        };
      else if (latestAction === "location" || latestAction === "followup") {
        const answer = latestAction === "location" ? location : followup;
        const acknowledgment = answer?.value
          ? latestAction === "location"
            ? `I've updated the location to ${answer.value}, based on your report. It has not been independently verified.`
            : `Recorded your update: ${answer.value}. This is officer-reported information.`
          : `Understood. ${latestAction === "location" ? "The exact location" : script.assessment.unknowns[1].replace(/ unknown$/, "")} is now marked as unknown. Any earlier answer for that field is retained in the conversation history, not treated as the current answer.`;
        response = {
          reply: `${acknowledgment} ${next}`,
          question,
          suggestedReplies,
          assessment: a,
        };
      } else
        response = {
          reply:
            "This is a scripted sample conversation, so I cannot reliably interpret that free-form message. Your message is saved. Choose a suggested reply, use “Location: …” or “Correction: …” to supply a location, or update the brief manually. Live Gemini will support open-ended conversation.",
          question,
          suggestedReplies,
          assessment: null,
        };
    }
    for (const text of response.reply.match(/.{1,44}(?:\s|$)|.{1,44}/gs) ?? [
      response.reply,
    ]) {
      if (input.signal.aborted) throw Error("Interrupted");
      if (this.delay) await new Promise((r) => setTimeout(r, this.delay));
      yield { type: "delta", text };
    }
    yield { type: "result", response };
  }
}
