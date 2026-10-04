import { useEffect, useRef, useState } from "react";
import type {
  ConversationSnapshot,
  ConversationTurn,
} from "@copilot/contracts";
import { apiRequest } from "../../api";
import { streamConversation } from "./stream";
export function useConversation(
  id: string,
  initial: boolean,
  onUpdate: (s: ConversationSnapshot) => void,
) {
  const [snapshot, setSnapshot] = useState<ConversationSnapshot>();
  const [busy, setBusy] = useState(false),
    [partial, setPartial] = useState(""),
    [stage, setStage] = useState(""),
    [error, setError] = useState("");
  const controller = useRef<AbortController | undefined>(undefined);
  const alive = useRef(true),
    running = useRef(false),
    current = useRef<ConversationSnapshot | undefined>(undefined);
  const updateRef = useRef(onUpdate);
  updateRef.current = onUpdate;
  const apply = (s: ConversationSnapshot) => {
    if (!alive.current) return;
    current.current = s;
    setSnapshot(s);
    updateRef.current(s);
  };
  async function refresh() {
    const s = await apiRequest<ConversationSnapshot>(
      `/incidents/${id}/conversation`,
    );
    apply(s);
    return s;
  }
  async function execute(
    text?: string,
    base = current.current,
    retry?: ConversationTurn,
  ) {
    if (!base || running.current || !alive.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setPartial("");
    const ctrl = new AbortController();
    controller.current = ctrl;
    const turnId = retry?.id ?? crypto.randomUUID();
    const kind = text ? "message" : "initial";
    const at = new Date().toISOString();
    if (!retry)
      apply({
        ...base,
        turns: [
          ...base.turns,
          {
            id: turnId,
            incidentId: id,
            kind,
            officerText: text ?? "",
            state: "processing",
            attempts: 1,
            createdAt: at,
            updatedAt: at,
          },
        ],
      });
    const timeout = setTimeout(() => ctrl.abort(), 60000);
    try {
      await streamConversation(
        retry
          ? `/incidents/${id}/turns/${turnId}/retry`
          : `/incidents/${id}/turns`,
        retry
          ? {
              attemptId: crypto.randomUUID(),
              expectedRevision: base.incident.revision,
            }
          : {
              turnId,
              expectedRevision: base.incident.revision,
              kind,
              ...(text ? { text } : {}),
            },
        (e) => {
          if (!alive.current) return;
          if (e.type === "status") setStage(e.stage);
          if (e.type === "delta") setPartial((p) => p + e.text);
          if (e.type === "completed") {
            apply(e.snapshot);
            setPartial("");
            setStage("waiting_for_reply");
          }
        },
        ctrl.signal,
      );
    } catch (e) {
      if (alive.current)
        setError(
          (e as Error).name === "AbortError"
            ? "The response was interrupted. Your report is saved."
            : (e as Error).message,
        );
    } finally {
      clearTimeout(timeout);
      if (alive.current) {
        await refresh().catch(() => {});
        setBusy(false);
        setPartial("");
        setStage("");
      }
      running.current = false;
    }
  }
  useEffect(() => {
    alive.current = true;
    void refresh()
      .then((s) => {
        if (alive.current && initial && !s.turns.length)
          void execute(undefined, s);
      })
      .catch((e) => {
        if (alive.current) setError(e.message);
      });
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, [id]);
  useEffect(() => {
    if (busy || !snapshot?.turns.some((t) => t.state === "processing")) return;
    const timer = setInterval(() => {
      void refresh().catch(() => {});
    }, 2000);
    return () => clearInterval(timer);
  }, [snapshot, busy]);
  return {
    snapshot,
    busy,
    partial,
    stage,
    error,
    setError,
    send: (text: string) => execute(text),
    start: () => execute(),
    retry: (turn: ConversationTurn) =>
      execute(undefined, current.current, turn),
    refresh,
  };
}
