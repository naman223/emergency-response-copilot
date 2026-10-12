// Real Gemini inference over fictional synthetic recordings; Firebase stays local.
import { readFile, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import {
  type Incident,
  type ConversationSnapshot,
  recommendedServices,
} from "@copilot/contracts";
import { buildApp } from "../apps/api/src/app";
import { createConfig } from "../apps/api/src/config";
import { createFirebase } from "../apps/api/src/infra/firebase";
import { FixtureProvider } from "../apps/api/src/analysis/fixture";
import { GeminiConversationProvider } from "../apps/api/src/conversation/gemini";
import { RejectedConsistencyReview } from "../apps/api/src/conversation/consistency-review";
import { localEnvironment } from "./local-env";
import {
  checkPreview,
  checkTranscript,
  checkReload,
  checkAssessment,
  runOptions,
  requireLocalEmulators,
  type VoiceCase,
  type Expectation,
} from "./voice-evaluation";

requireLocalEmulators(process.env);
const matrix = JSON.parse(
  await readFile("fixtures/voice-evaluation/manifest.json", "utf8"),
) as VoiceCase[];
if (
  !matrix.length ||
  matrix.length > 8 ||
  new Set(matrix.map((item) => item.id)).size !== matrix.length
)
  throw Error("Use at most eight distinct scenarios");
const options = runOptions(
  process.argv.slice(2),
  matrix.map((item) => item.id),
);
const config = createConfig(localEnvironment(process.env, true));
const firebase = createFirebase(config);
const gemini = new GeminiConversationProvider(config);
let rejected: unknown;
const app = await buildApp({
  config,
  ...firebase,
  provider: new FixtureProvider(),
  conversationProvider: {
    async *generate(input) {
      try {
        yield* gemini.generate(input);
      } catch (error) {
        if (error instanceof RejectedConsistencyReview)
          rejected = {
            message: error.message,
            structuredCandidate: error.candidate,
          };
        throw error;
      }
    },
  },
});
const rows: any[] = [];
const persist = () =>
  writeFile(
    options.output,
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        checkerVersion: 2,
        model: config.model,
        passes: options.passes,
        note: "Finite fictional synthetic voice checks, not real accent/microphone, clinical or model-accuracy validation. Authenticated local Firebase with real Gemini; no dispatch or approval. All attempts retained; no retry-until-success. Only decoded non-thought structured responses are recorded.",
        rows,
      },
      null,
      2,
    ) + "\n",
  );
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
function multipart(audio: Buffer, metadata?: unknown) {
  const boundary = "copilot" + randomUUID();
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    payload: Buffer.concat([
      ...(metadata
        ? [
            Buffer.from(
              `--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${JSON.stringify(metadata)}\r\n`,
            ),
          ]
        : []),
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="fictional.wav"\r\nContent-Type: audio/wav\r\n\r\n`,
      ),
      audio,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  };
}
try {
  for (let pass = 1; pass <= options.passes; pass++) {
    for (const item of matrix.filter(
      (entry) => !options.selected || entry.id === options.selected,
    )) {
      const row: any = {
        id: item.id,
        pass,
        language: item.language,
        voice: item.voice ?? item.signal,
        audioSha256: item.sha256,
        durationSeconds: item.durationSeconds,
        stage: "authentication",
        turns: [],
        issues: [],
      };
      rows.push(row);
      rejected = undefined;
      try {
        if (!/^[a-z-]+\.wav$/.test(item.audio))
          throw Error("Invalid fixture path");
        const audio = await readFile("fixtures/voice-evaluation/" + item.audio);
        if (!item.sha256 || hash(audio) !== item.sha256)
          throw Error("Fixture hash mismatch; regenerate manifest");
        const signup = await fetch(
          `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ returnSecureToken: true }),
            signal: AbortSignal.timeout(10000),
          },
        );
        const { idToken } = (await signup.json()) as { idToken?: string };
        if (!idToken) throw Error("Local authentication failed");
        const request = async (
          path: string,
          payload?: unknown,
          contentType = "application/json",
        ) => {
          const response = await app.inject({
            method: payload ? "POST" : "GET",
            url: "/api" + path,
            headers: {
              authorization: `Bearer ${idToken}`,
              "content-type": contentType,
            },
            ...(payload ? { payload: payload as any } : {}),
          });
          if (response.statusCode < 200 || response.statusCode >= 300) {
            const code = response.json().error?.code ?? "HTTP_ERROR";
            throw Error(`HTTP ${response.statusCode}: ${code}`);
          }
          return response;
        };
        await request("/session", {});
        row.stage = "preview";
        const upload = multipart(audio);
        const previewStart = performance.now();
        const preview = (
          await request("/report-preview", upload.payload, upload.contentType)
        ).json() as { transcript: string; locationDescription: string | null };
        row.preview = {
          ...preview,
          latencyMs: Math.round(performance.now() - previewStart),
        };
        row.issues.push(
          ...checkPreview(item, preview).map((issue) => "Preview: " + issue),
        );
        if ((await request("/incidents")).json().length)
          row.issues.push("Preview unexpectedly created an incident");
        await persist();
        if (item.kind === "non-speech" || !preview.transcript.trim()) {
          row.stage = "finished-preview-only";
          await persist();
          continue;
        }
        row.stage = "create";
        const intake = multipart(audio, {
          reportText: preview.transcript,
          ...(preview.locationDescription
            ? { locationDescription: preview.locationDescription }
            : {}),
        });
        let incident = (
          await request("/incidents", intake.payload, intake.contentType)
        ).json() as Incident;
        row.incidentId = incident.id;
        const savedAudioHash = hash(
          (await request(`/incidents/${incident.id}/audio`)).rawPayload,
        );
        let transcript: string | undefined;
        let latestSnapshot: ConversationSnapshot | undefined;
        let clarificationAnswers = 0;
        const turn = async (
          kind: "initial" | "message" | "finish",
          expected: Expectation,
          text?: string,
        ) => {
          rejected = undefined;
          row.stage = kind;
          const start = performance.now();
          const response = await request(`/incidents/${incident.id}/turns`, {
            turnId: randomUUID(),
            expectedRevision: incident.revision,
            kind,
            ...(text ? { text } : {}),
          });
          const events = response.body
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line));
          const complete = events
            .filter((event) => event.type === "completed")
            .at(-1);
          if (!complete) {
            row.failure = {
              stage: kind,
              code: events.filter((event) => event.type === "failure").at(-1)
                ?.code,
              rejected,
            };
            throw Error("No accepted assessment");
          }
          const snapshot = complete.snapshot as ConversationSnapshot;
          latestSnapshot = snapshot;
          incident = snapshot.incident;
          const last = snapshot.turns.at(-1)!;
          const issues = checkAssessment(
            expected,
            incident.assessment!,
            last.reply ?? "",
          );
          if (kind === "initial") {
            transcript = incident.sourceTranscript;
            issues.push(
              ...checkTranscript(item, transcript ?? "").map(
                (issue) => "Original transcript: " + issue,
              ),
            );
          } else if (incident.sourceTranscript !== transcript)
            issues.push("Original transcript changed after initial assessment");
          if (text) clarificationAnswers++;
          if (incident.reportText !== preview.transcript)
            issues.push("Reviewed preview report changed");
          if (
            incident.dispatchReceipt ||
            incident.simulationState !== "not_started"
          )
            issues.push("Unexpected dispatch without human approval");
          if (
            kind === "finish" &&
            (incident.intakeState !== "ready" || last.question)
          )
            issues.push("Manual completion did not stop clarification");
          row.turns.push({
            kind,
            text: text ?? null,
            reply: last.reply,
            question: last.question,
            intakeState: incident.intakeState,
            sourceTranscript: incident.sourceTranscript,
            assessment: incident.assessment,
            services: recommendedServices(incident),
            latencyMs: Math.round(performance.now() - start),
            issues,
          });
          row.issues.push(...issues.map((issue) => `${kind}: ${issue}`));
          console.log(
            `pass ${pass} ${item.id} ${kind}: ${issues.length} expected-field issues`,
          );
          await persist();
          return last;
        };
        const first = await turn("initial", item.initial!);
        if (first.question && incident.intakeState !== "ready")
          await turn("message", item.initial!, "Unknown");
        if (incident.intakeState !== "ready")
          await turn("finish", item.initial!);
        if (item.correction) {
          const update = await turn(
            "message",
            item.correction.expected,
            item.correction.text,
          );
          if (incident.intakeState !== "ready" || update.question)
            row.issues.push(
              "Post-completion correction reopened clarification",
            );
        }
        row.stage = "reload";
        const restored = (
          await request(`/incidents/${incident.id}/conversation`)
        ).json() as ConversationSnapshot;
        if (!latestSnapshot) throw Error("No snapshot for reload comparison");
        const persistenceIssues = checkReload(latestSnapshot, restored);
        if (
          (restored.incident.clarifications?.length ?? 0) !==
          clarificationAnswers
        )
          persistenceIssues.push(
            "Saved clarification count differs from submitted answers",
          );
        if (
          hash(
            (await request(`/incidents/${incident.id}/audio`)).rawPayload,
          ) !== savedAudioHash
        )
          persistenceIssues.push("Saved normalized audio changed");
        row.issues.push(...persistenceIssues);
        row.reloadHistory = {
          clarifications: restored.incident.clarifications,
          turns: restored.turns,
        };
        row.persistenceVerified = persistenceIssues.length === 0;
        row.stage = "completed";
      } catch (error) {
        // Only local harness/HTTP labels, never an upstream request body or credentials.
        row.failure ??= { stage: row.stage, error: (error as Error).name };
        row.issues.push(`Stopped during ${row.stage}`);
      }
      await persist();
      console.log(
        `pass ${pass} ${item.id}: ${row.stage}; ${row.issues.length} flags`,
      );
    }
  }
} finally {
  await app.close();
  await firebase.close();
}
console.log(
  JSON.stringify({
    attempted: rows.length,
    withFlags: rows.filter((row) => row.issues.length).length,
    output: options.output,
  }),
);
if (rows.some((row) => row.issues.length)) process.exitCode = 1;
