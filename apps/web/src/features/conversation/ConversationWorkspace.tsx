import { useEffect, useState } from "react";
import { Radio, PanelRight, ClipboardCheck, X } from "lucide-react";
import type {
  Incident,
  ConversationSnapshot,
  DecisionRequest,
  ReviewDraft,
} from "@copilot/contracts";
import { useConversation } from "./useConversation";
import { ConversationThread } from "./ConversationThread";
import { MessageComposer } from "./MessageComposer";
import { IncidentContext } from "./IncidentContext";
import { ReviewedIncident } from "./ReviewedIncident";
import { urgencyLabel } from "./IncidentContext";
import { ReviewForm } from "../responder/ReviewForm";
import { apiRequest } from "../../api";
export function ConversationWorkspace({
  id,
  initial,
  mode,
  onUpdate,
}: {
  id: string;
  initial: boolean;
  mode: string;
  onUpdate: (i: Incident) => void;
}) {
  const [panel, setPanel] = useState<"context" | "review">("review"),
    [showPanel, setShowPanel] = useState(false),
    [saving, setSaving] = useState(false),
    [saved, setSaved] = useState(false),
    [history, setHistory] = useState<
      Array<{ id: string; action: string; reason?: string; at: string }>
    >([]);
  const chat = useConversation(id, initial, (s) => onUpdate(s.incident));
  const i = chat.snapshot?.incident;
  const closed = i && ["approved", "closed"].includes(i.reviewState);
  const intakeReady = i?.intakeState === "ready";
  useEffect(() => {
    if (intakeReady) {
      setShowPanel(true);
    }
  }, [intakeReady]);
  useEffect(() => {
    if (i)
      apiRequest<typeof history>(`/incidents/${id}/history`)
        .then(setHistory)
        .catch(() => {});
  }, [i?.revision]);
  const stageNames: Record<string, string> =
    mode === "fixture"
      ? {
          receiving_report: "Report received",
          analyzing_report: "Loading the scripted scenario…",
          receiving_response: "Playing the sample coordinator response…",
          updating_context: "Updating the incident context…",
        }
      : {
          receiving_report: "Report received",
          analyzing_report: "Analyzing the report…",
          receiving_response: "Coordinator is responding…",
          updating_context: "Updating the incident context…",
        };
  async function save(draft: ReviewDraft) {
    if (!i) return;
    setSaving(true);
    chat.setError("");
    try {
      await apiRequest(`/incidents/${id}/review`, {
        method: "PATCH",
        body: JSON.stringify({ expectedRevision: i.revision, draft }),
      });
      await chat.refresh();
      setSaved(true);
    } catch (e) {
      chat.setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function decide(action: DecisionRequest["action"], reason: string) {
    if (!i) return;
    setSaving(true);
    chat.setError("");
    try {
      await apiRequest(`/incidents/${id}/decision`, {
        method: "POST",
        body: JSON.stringify({
          expectedRevision: i.revision,
          action,
          reason,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      await chat.refresh();
      setPanel("review");
      setShowPanel(true);
    } catch (e) {
      chat.setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const last = chat.snapshot?.turns.at(-1);
  const replies =
    last?.state === "completed" ? (last.suggestedReplies ?? []) : [];
  return (
    <div
      className={`coordinator-workspace ${showPanel ? "panel-visible" : ""}`}
    >
      <section className="chat-column">
        <header className="chat-header">
          <span className="coordinator-emblem">
            <Radio size={23} />
          </span>
          <div>
            <h1>AI emergency coordinator</h1>
            <p>
              <span className="status-dot" />
              {closed
                ? "Conversation archived"
                : "Here to help you organize the response"}
            </p>
          </div>
          <span className="chat-report-id">
            #{id.slice(0, 6).toUpperCase()}
          </span>
        </header>
        <div className="chat-toolbar">
          <span className="mode-pill">
            {mode === "fixture" ? "Scripted sample mode" : "Live Gemini"}
          </span>
          <div>
            <button
              onClick={() => {
                setPanel("context");
                setShowPanel((v) => !v);
              }}
            >
              <PanelRight size={15} />
              Incident context
            </button>
            <button
              onClick={() => {
                setPanel("review");
                setShowPanel(true);
              }}
            >
              <ClipboardCheck size={15} />
              Review and decide
            </button>
          </div>
        </div>
        {i && !closed && (
          <div
            className={`intake-progress ${intakeReady ? "ready" : ""}`}
            role="status"
          >
            <div>
              <strong>
                {intakeReady ? "Assessment ready" : "Essential clarification"}
              </strong>
              <p>
                {intakeReady
                  ? `${urgencyLabel(i.assessment?.urgency ?? "unclear")} · Suggested responder: ${i.assessment?.routing ?? "not determined"}. Review the handoff below; you can still add corrections.`
                  : `${i.clarificationCount ?? 0} of up to 10 questions · Target: 5 essential questions. Unknown is accepted.`}
              </p>
            </div>
            {intakeReady ? (
              <button
                className="secondary"
                onClick={() => {
                  setPanel("review");
                  setShowPanel(true);
                }}
              >
                Review handoff
              </button>
            ) : (
              <button
                className="secondary"
                disabled={chat.busy || saving || !chat.snapshot?.turns.length}
                onClick={() => void chat.finish()}
              >
                Finish assessment now
              </button>
            )}
          </div>
        )}
        {chat.error && (
          <div className="chat-error" role="alert">
            {chat.error}
            <button onClick={() => void chat.refresh()}>Refresh</button>
          </div>
        )}
        {!chat.snapshot ? (
          <div className="chat-loading">Opening your conversation…</div>
        ) : (
          <ConversationThread
            id={id}
            turns={chat.snapshot.turns}
            partial={chat.partial}
            busy={chat.busy}
            stage={stageNames[chat.stage]}
            onRetry={(t) => void chat.retry(t)}
          />
        )}
        {chat.snapshot && !chat.snapshot.turns.length && !chat.busy && (
          <button
            className="primary initial-response"
            onClick={() => void chat.start()}
          >
            Ask the coordinator to review this report
          </button>
        )}
        {closed ? (
          <div className="archived-notice">
            This conversation is read-only. Start a new incident to report more
            information.
          </div>
        ) : (
          <MessageComposer
            disabled={
              !chat.snapshot ||
              chat.busy ||
              saving ||
              !last ||
              last.state === "processing"
            }
            suggestions={replies}
            onSend={async (text) => {
              setSaved(false);
              await chat.send(text);
            }}
          />
        )}
      </section>
      <aside className="incident-side-panel">
        <div className="panel-navigation">
          <button
            className={panel === "context" ? "active" : ""}
            onClick={() => setPanel("context")}
          >
            Context
          </button>
          <button
            className={panel === "review" ? "active" : ""}
            onClick={() => setPanel("review")}
          >
            Human review
          </button>
          <button
            aria-label="Close incident panel"
            className="panel-close"
            onClick={() => setShowPanel(false)}
          >
            <X size={18} />
          </button>
        </div>
        {i &&
          (closed ? (
            <ReviewedIncident
              incident={i}
              reason={
                [...history]
                  .reverse()
                  .find((e) => e.action === "approve" || e.action === "close")
                  ?.reason
              }
            />
          ) : panel === "context" ? (
            <IncidentContext
              incident={i}
              onReview={() => {
                setPanel("review");
                setShowPanel(true);
              }}
            />
          ) : (
            <div className="conversation-review">
              {saved && (
                <p className="saved-note" role="status">
                  Review saved
                </p>
              )}
              {i.reviewDraft && i.reviewContextVersion !== i.contextVersion && (
                <p className="stale-review">
                  New information arrived. Recheck your saved review against the
                  new context.
                </p>
              )}
              <ReviewForm
                key={i.id}
                incident={i}
                busy={saving || chat.busy}
                onSave={save}
                onDecide={decide}
              />
              {history.length > 0 && (
                <div className="conversation-history">
                  <h3>Decision history</h3>
                  {history.map((h) => (
                    <p key={h.id}>
                      {h.action === "edit"
                        ? "Review saved"
                        : h.action === "needs_clarification"
                          ? "Clarification requested"
                          : h.action}{" "}
                      ·{" "}
                      {new Date(h.at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
      </aside>
    </div>
  );
}
