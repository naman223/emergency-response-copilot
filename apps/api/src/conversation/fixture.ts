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
      const a: ConversationAssessment = structuredClone(
        input.assessment ?? script.assessment,
      );
      const text = latest.officerText.trim();
      const locationAnswers = [
        "University campus, beside the library",
        "North gate of the campus",
      ];
      const lastReply = [...input.turns]
        .reverse()
        .find((t) => t.state === "completed" && t.question);
      const siteAnswered = input.turns.some(
        (t) =>
          locationAnswers.includes(t.officerText) ||
          /^(Location:|Correction:)/i.test(t.officerText),
      );
      const suggestions = siteAnswered
        ? script.answers
        : ["University campus, beside the library", "Unknown"];
      if (latest.kind === "initial") {
        response = {
          reply: `Received. ${script.opening} ${script.question}`,
          question: script.question,
          suggestedReplies: [
            "University campus, beside the library",
            "Unknown",
          ],
          assessment: a,
          transcript: script.transcript,
        };
      } else if (
        locationAnswers.includes(text) ||
        /^(Location:|Correction:)/i.test(text)
      ) {
        const location = text.replace(/^(Location:|Correction:)\s*/i, "");
        a.locationDescription = location;
        a.unknowns = a.unknowns.filter((x) => x !== "Exact location unknown");
        a.facts = a.facts.filter(
          (f) => !f.text.startsWith("Officer-reported location:"),
        );
        a.facts.push({
          text: `Officer-reported location: ${location}`,
          source: { source: "officer", messageId: latest.id, quote: text },
          evidenceStatus: "unverified",
        });
        a.summary = `${script.opening} Officer-reported location: ${location}.`;
        response = {
          reply: `I've ${text.startsWith("Correction:") ? "corrected" : "added"} the location to ${location}, based on your report. It has not been independently verified. ${script.followup}`,
          question: script.followup,
          suggestedReplies: script.answers,
          assessment: a,
        };
      } else if (text === "Why this recommendation?") {
        response = {
          reply:
            `${script.opening} This recommendation is based on the reported content, not the speaker's emotional tone. It remains a suggestion for your review. ${lastReply?.question ?? ""}`.trim(),
          question: lastReply?.question ?? null,
          suggestedReplies: lastReply?.suggestedReplies ?? suggestions,
          assessment: null,
        };
      } else if (
        text === "Unknown" ||
        text === "I cannot confirm" ||
        script.answers.includes(text)
      ) {
        const unknown = text === "Unknown" || text === "I cannot confirm";
        const previousUnknown = input.turns
          .slice(0, -1)
          .filter((t) => t.officerText === "Unknown").length;
        const answeringSite =
          !siteAnswered &&
          previousUnknown === 0 &&
          (!lastReply || lastReply.question === script.question);
        if (answeringSite) {
          response = {
            reply: `Understood. The exact location remains unknown; I won't fill it in. ${script.followup}`,
            question: script.followup,
            suggestedReplies: script.answers,
            assessment: a,
          };
        } else {
          if (!unknown) {
            a.unknowns = a.unknowns.filter(
              (x) =>
                x !== "Injury status unknown" &&
                x !== "Further context unknown",
            );
            a.facts.push({
              text: `Officer update: ${text}`,
              source: { source: "officer", messageId: latest.id, quote: text },
              evidenceStatus: "unverified",
            });
            a.summary += ` Officer update: ${text}.`;
            if (text === "A person is being threatened") {
              a.urgency = "urgent_review";
              a.routing = "police";
            }
          }
          response = {
            reply: `${unknown ? "Understood. I'll keep that information marked as unknown." : `Recorded your update: ${text}. This is officer-reported information.`} The incident brief is ready for your review. You can correct the location, ask why I suggested this response, or open Review and decide. No emergency service has been contacted.`,
            question: null,
            suggestedReplies: [
              "Why this recommendation?",
              "Correction: the south gate, beside the library",
            ],
            assessment: a,
          };
        }
      } else {
        response = {
          reply:
            "This is a scripted sample conversation, so I cannot reliably interpret that free-form message. Your message is saved. Choose a suggested reply, use “Location: …” or “Correction: …” to supply a location, or update the brief manually. Live Gemini will support open-ended conversation.",
          question: lastReply?.question ?? script.question,
          suggestedReplies: lastReply?.suggestedReplies ?? suggestions,
          assessment: null,
        };
      }
    }
    const parts = response.reply.match(/.{1,44}(?:\s|$)|.{1,44}/gs) ?? [
      response.reply,
    ];
    for (const text of parts) {
      if (input.signal.aborted) throw Error("Interrupted");
      if (this.delay) await new Promise((r) => setTimeout(r, this.delay));
      yield { type: "delta", text };
    }
    yield { type: "result", response };
  }
}
