import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { turnRequestSchema, retryTurnRequestSchema } from "@copilot/contracts";
import { authenticate, verifySession } from "../auth/session";
import type { AppDependencies } from "../app";
import { ConversationService } from "./service";
import { eventWriter } from "./stream";
import { FixtureConversationProvider } from "./fixture";
import { GeminiConversationProvider } from "./gemini";
import { AppError } from "../errors";
export function registerConversationRoutes(
  app: FastifyInstance,
  d: AppDependencies,
) {
  const provider =
    d.conversationProvider ??
    (d.config.mode === "live"
      ? new GeminiConversationProvider(d.config)
      : new FixtureConversationProvider());
  const service = new ConversationService({ ...d, provider });
  const session = async (r: any) =>
    verifySession(
      d.db,
      await authenticate(r.headers.authorization, d.verifyToken),
    );
  const id = (r: any) => z.uuid().parse(r.params.id);
  app.get("/api/incidents/:id/conversation", async (r) =>
    service.get(await session(r), id(r)),
  );
  for (const retry of [false, true])
    app.post(
      retry
        ? "/api/incidents/:id/turns/:turnId/retry"
        : "/api/incidents/:id/turns",
      async (r, reply) => {
        const s = await session(r),
          incidentId = id(r),
          body = retry
            ? retryTurnRequestSchema.parse(r.body)
            : turnRequestSchema.parse(r.body);
        const writer = eventWriter(reply);
        try {
          if (retry)
            await service.retry(
              s,
              incidentId,
              z.uuid().parse((r.params as any).turnId),
              body as any,
              (e) => writer.emit(e),
              writer.signal,
            );
          else
            await service.run(
              s,
              incidentId,
              body as any,
              (e) => writer.emit(e),
              writer.signal,
            );
        } catch (e) {
          if (!writer.started) throw e;
          try {
            await writer.emit({
              turnId: retry ? (r.params as any).turnId : (body as any).turnId,
              sequence: 2147483647,
              type: "failure",
              code: e instanceof AppError ? e.code : "STREAM_FAILED",
              message:
                "The response was interrupted. Reload to recover your saved conversation.",
            });
          } catch {}
        } finally {
          writer.end();
        }
        return reply;
      },
    );
}
