// Fictional live Gemini checks against local Firebase emulators. No real dispatch.
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  recommendedServices,
  primaryRouting,
  type Incident,
} from "@copilot/contracts";
import { buildApp } from "../apps/api/src/app";
import { createConfig } from "../apps/api/src/config";
import { createFirebase } from "../apps/api/src/infra/firebase";
import { FixtureProvider } from "../apps/api/src/analysis/fixture";
import { GeminiConversationProvider } from "../apps/api/src/conversation/gemini";
import { RejectedConsistencyReview } from "../apps/api/src/conversation/consistency-review";
import { localEnvironment } from "./local-env";

for (const key of [
  "FIRESTORE_EMULATOR_HOST",
  "FIREBASE_AUTH_EMULATOR_HOST",
  "FIREBASE_STORAGE_EMULATOR_HOST",
])
  if (!process.env[key]?.startsWith("127.0.0.1:"))
    throw Error("Local Firebase emulators are required");
const cases = JSON.parse(
  await readFile("fixtures/correction-reports.json", "utf8"),
) as Array<{
  id: string;
  report: string;
  steps: Array<{
    text?: string;
    urgency?: string;
    indicators: Record<string, string>;
  }>;
}>;
const filter = process.argv.find((arg) => arg.startsWith("--case="))?.slice(7);
if (filter && !cases.some((item) => item.id === filter))
  throw Error("Unknown correction case");
const output =
  process.argv.find((arg) => arg.startsWith("--output="))?.slice(9) ??
  "docs/correction-live-results.json";
const config = createConfig(localEnvironment(process.env, true));
const firebase = createFirebase(config);
const gemini = new GeminiConversationProvider(config);
let diagnostic: string | undefined;
let rejectedCandidate: unknown;
const app = await buildApp({
  config,
  ...firebase,
  provider: new FixtureProvider(),
  conversationProvider: {
    async *generate(input) {
      try {
        yield* gemini.generate(input);
      } catch (error) {
        // Record known validation failures only, never transport payloads or credentials.
        const value = error as Error;
        diagnostic =
          value.name === "RejectedConsistencyReview"
            ? value.message
            : value.name;
        if (error instanceof RejectedConsistencyReview) {
          const { reply, question, suggestedReplies, assessment } =
            error.candidate;
          rejectedCandidate = { reply, question, suggestedReplies, assessment };
        }
        throw error;
      }
    },
  },
});
const rows: any[] = [];
try {
  for (const item of cases.filter((item) => !filter || item.id === filter)) {
    const signup = await fetch(
      `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ returnSecureToken: true }),
      },
    );
    const { idToken } = (await signup.json()) as { idToken?: string };
    if (!idToken) throw Error("Local authentication unavailable");
    const headers = { authorization: `Bearer ${idToken}` };
    const request = async (url: string, payload?: any) => {
      const response = await app.inject({
        method: payload ? "POST" : "GET",
        url: "/api" + url,
        headers,
        ...(payload ? { payload } : {}),
      });
      if (response.statusCode < 200 || response.statusCode >= 300)
        throw Error(`HTTP ${response.statusCode} for ${url}`);
      return response;
    };
    const row: any = { id: item.id, turns: [], issues: [] };
    rows.push(row);
    try {
      await request("/session", {});
      let incident = (
        await request("/incidents", { reportText: item.report })
      ).json() as Incident;
      row.incidentId = incident.id;
      for (const [index, step] of item.steps.entries()) {
        diagnostic = undefined;
        rejectedCandidate = undefined;
        const start = performance.now();
        const response = await request(`/incidents/${incident.id}/turns`, {
          turnId: randomUUID(),
          expectedRevision: incident.revision,
          kind: index ? "message" : "initial",
          ...(step.text ? { text: step.text } : {}),
        });
        const events = response.body
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line));
        const completed = events
          .filter((event) => event.type === "completed")
          .at(-1);
        if (!completed) {
          row.failure = {
            step: index + 1,
            code: events.filter((event) => event.type === "failure").at(-1)
              ?.code,
            diagnostic,
            rejectedCandidate,
          };
          throw Error(`No accepted assessment at step ${index + 1}`);
        }
        incident = completed.snapshot.incident;
        const turn = completed.snapshot.turns.at(-1);
        const assessment = incident.assessment!;
        const issues: string[] = [];
        if (step.urgency && assessment.urgency !== step.urgency)
          issues.push(
            `Expected ${step.urgency}, received ${assessment.urgency}`,
          );
        for (const [key, expected] of Object.entries(step.indicators)) {
          const status =
            assessment.indicators?.[key as keyof typeof assessment.indicators]
              ?.status;
          if (status !== expected)
            issues.push(`${key}: expected ${expected}, received ${status}`);
        }
        if (assessment.facts.some((fact) => fact.evidenceStatus !== "matched"))
          issues.push("Unmatched source quote");
        if (
          /\b(?:dead|deceased|not breathing|non-breathing)\b/i.test(
            `${turn.reply} ${assessment.summary}`,
          )
        )
          issues.push(
            "Unsupported medical certainty; manually inspect wording",
          );
        if (index && incident.intakeState === "ready" && turn.question)
          issues.push("Completed intake reopened questions");
        row.turns.push({
          step: index + 1,
          answer: step.text ?? null,
          latencyMs: Math.round(performance.now() - start),
          reply: turn.reply,
          question: turn.question,
          assessment,
          services: recommendedServices(incident),
          issues,
        });
        row.issues.push(
          ...issues.map((issue) => `Step ${index + 1}: ${issue}`),
        );
        console.log(
          item.id,
          `step ${index + 1}`,
          issues.length
            ? JSON.stringify(issues)
            : "accepted; expected fields matched",
        );
      }
      const restored = (
        await request(`/incidents/${incident.id}/conversation`)
      ).json();
      if (
        !isDeepStrictEqual(restored.incident.assessment, incident.assessment) ||
        restored.incident.clarifications?.length !== item.steps.length - 1
      )
        row.issues.push(
          "Corrected assessment or full clarification history not retained",
        );
      const services = recommendedServices(incident);
      if (!row.issues.length && services.length) {
        const assessment = incident.assessment!;
        const approved = (
          await request(`/incidents/${incident.id}/decision`, {
            action: "approve",
            expectedRevision: incident.revision,
            reason: "Fictional correction workflow verification",
            idempotencyKey: randomUUID(),
            draft: {
              summary: assessment.summary,
              urgency: assessment.urgency,
              routing: primaryRouting(services),
              services,
              locationDescription: assessment.locationDescription,
              confirmedFields: [],
              editedFields: [],
            },
          })
        ).json() as Incident;
        const persisted = (
          await request(`/incidents/${incident.id}`)
        ).json() as Incident;
        row.approvalVerified =
          approved.reviewState === "approved" &&
          persisted.dispatchReceipt?.smsMessages?.length === services.length &&
          isDeepStrictEqual(persisted.assessment, assessment) &&
          persisted.clarifications?.length === item.steps.length - 1;
        if (!row.approvalVerified)
          row.issues.push(
            "Simulated approval or reload did not preserve correction details",
          );
      } else
        row.approvalSkipped = row.issues.length
          ? "Assessment issues require manual review"
          : "No suggested service; human choice required";
    } catch (error) {
      row.issues.push((error as Error).message);
    }
    await writeFile(
      output,
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          model: config.model,
          note: "Five fictional correction sequences. Local Firebase persistence and real Gemini inference; all attempted outcomes retained, no real services contacted. Narrow expected-field checks require manual semantic review, not an accuracy benchmark. No thought parts or credentials stored.",
          rows,
        },
        null,
        2,
      ) + "\n",
    );
  }
} finally {
  await app.close();
  await firebase.close();
}
console.log(
  JSON.stringify({
    cases: rows.length,
    withoutIssues: rows.filter((row) => !row.issues.length).length,
  }),
);
if (rows.some((row) => row.issues.length)) process.exitCode = 1;
