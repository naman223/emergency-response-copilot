import type { OutgoingHttpHeaders } from "node:http";
import type { FastifyReply } from "fastify";
import type { ConversationEvent } from "@copilot/contracts";
export function eventWriter(reply: FastifyReply) {
  let started = false,
    closed = false;
  reply.raw.on("close", () => {
    closed = true;
  });
  return {
    get started() {
      return started;
    },
    async emit(event: ConversationEvent) {
      if (closed) throw Error("Stream disconnected");
      if (!started) {
        reply.hijack();
        reply.raw.writeHead(200, {
          ...reply.getHeaders(),
          "content-type": "application/x-ndjson; charset=utf-8",
          "cache-control": "private, no-store",
          "x-accel-buffering": "no",
        } as OutgoingHttpHeaders);
        started = true;
      }
      const line = JSON.stringify(event) + "\n";
      if (!reply.raw.write(line))
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => finish(Error("Slow reader")), 2000);
          const drain = () => finish();
          const close = () => finish(Error("Disconnected"));
          function finish(error?: Error) {
            clearTimeout(timer);
            reply.raw.off("drain", drain);
            reply.raw.off("close", close);
            error ? reject(error) : resolve();
          }
          reply.raw.once("drain", drain);
          reply.raw.once("close", close);
        });
    },
    end() {
      if (started && !closed) reply.raw.end();
    },
  };
}
