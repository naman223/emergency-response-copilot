import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { z, ZodError } from "zod";
import { intakeSchema, editSchema, decisionSchema } from "@copilot/contracts";
import type { Config } from "./config";
import type { Database } from "./infra/repository";
import type { AudioStore } from "./infra/audio-store";
import type { AnalysisProvider } from "./analysis/provider";
import { AppError } from "./errors";
import { authenticate, startSession, verifySession } from "./auth/session";
import { IncidentService, samples } from "./incidents/service";
import { AnalysisService } from "./analysis/service";
import { ReviewService } from "./review/service";
import { resetSession } from "./demo/cleanup";
import { MAX_BYTES } from "./incidents/media";
export type AppDependencies = {
  config: Config;
  db: Database;
  audio: AudioStore;
  provider: AnalysisProvider;
  verifyToken: (token: string) => Promise<string>;
};
export async function buildApp(d: AppDependencies) {
  const app = Fastify({ logger: false, bodyLimit: MAX_BYTES + 65536 });
  await app.register(cors, { origin: d.config.origin });
  await app.register(multipart, {
    limits: { fileSize: MAX_BYTES, files: 1, fields: 1, fieldSize: 4096 },
  });
  const intake = new IncidentService(d),
    analysis = new AnalysisService(d),
    review = new ReviewService(d.db);
  const uid = (r: any) => authenticate(r.headers.authorization, d.verifyToken);
  const session = async (r: any) => verifySession(d.db, await uid(r));
  const id = (r: any) => z.uuid().parse(r.params.id);
  app.addHook("onRequest", async (req, reply) => {
    reply.header("Cache-Control", "private, no-store");
    reply.header("X-Content-Type-Options", "nosniff");
    if (req.headers.origin && req.headers.origin !== d.config.origin)
      throw new AppError(403, "ORIGIN_DENIED", "This origin is not allowed.");
  });
  app.setErrorHandler((error, req, reply) => {
    const e = error as Error & { statusCode?: number };
    const status =
      e instanceof AppError
        ? e.status
        : e instanceof ZodError
          ? 400
          : e.statusCode === 413
            ? 413
            : 500;
    const code =
      e instanceof AppError
        ? e.code
        : status === 400
          ? "INVALID_INPUT"
          : status === 413
            ? "AUDIO_SIZE"
            : "INTERNAL_ERROR";
    const message =
      e instanceof AppError
        ? e.message
        : status === 400
          ? "Check the submitted fields."
          : status === 413
            ? "Choose an audio file smaller than 10 MiB."
            : "The request could not be completed. Please try again.";
    reply.code(status).send({
      error: {
        code,
        message,
        retryable: e instanceof AppError ? e.retryable : status >= 500,
      },
    });
  });
  app.get("/api/health", async () => ({ ok: true }));
  app.get("/api/samples", async () => ({
    samples: await samples(),
    mode: d.config.mode,
  }));
  app.post("/api/session", async (r) => {
    const s = await startSession(d.db, await uid(r));
    return { expiresAt: s.expiresAt, mode: d.config.mode };
  });
  app.delete("/api/session", async (r, reply) => {
    await resetSession(d.db, d.audio, await uid(r));
    return reply.code(204).send();
  });
  app.get("/api/incidents", async (r) => intake.list(await session(r)));
  app.post("/api/incidents", async (r, reply) => {
    const s = await session(r);
    let metadata: unknown = r.body,
      bytes: Buffer | undefined;
    if (r.isMultipart()) {
      metadata = {};
      for await (const part of r.parts()) {
        if (part.type === "file") {
          bytes = await part.toBuffer();
          if (part.file.truncated)
            throw new AppError(413, "AUDIO_SIZE", "Audio exceeds 10 MiB.");
        } else {
          if (part.fieldname !== "metadata" || typeof part.value !== "string")
            throw new AppError(400, "INVALID_INPUT", "Invalid upload fields.");
          try {
            metadata = JSON.parse(part.value);
          } catch {
            throw new AppError(400, "INVALID_INPUT", "Invalid metadata.");
          }
        }
      }
    }
    const result = await intake.create(s, intakeSchema.parse(metadata), bytes);
    return reply.code(201).send(result);
  });
  app.get("/api/incidents/:id", async (r) =>
    intake.get(await session(r), id(r)),
  );
  app.get("/api/incidents/:id/audio", async (r, reply) =>
    reply.type("audio/wav").send(await intake.audio(await session(r), id(r))),
  );
  app.get("/api/incidents/:id/history", async (r) =>
    intake.history(await session(r), id(r)),
  );
  app.post("/api/incidents/:id/analyze", async (r) =>
    analysis.run(await session(r), id(r)),
  );
  app.patch("/api/incidents/:id/review", async (r) => {
    const s = await session(r),
      body = editSchema.parse(r.body);
    return review.save(s, id(r), body.expectedRevision, body.draft);
  });
  app.post("/api/incidents/:id/decision", async (r) =>
    review.decide(await session(r), id(r), decisionSchema.parse(r.body)),
  );
  return app;
}
