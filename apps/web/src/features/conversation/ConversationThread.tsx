import { useEffect, useRef, useState } from "react";
import { ArrowDown, Headphones, ClipboardList } from "lucide-react";
import type { ConversationTurn, Incident } from "@copilot/contracts";
import { conversationFailureMessage } from "@copilot/contracts";
import { IncidentReport } from "./IncidentReport";
import { MessageBubble } from "./MessageBubble";
import { audioUrl } from "../../api";
export function ConversationThread({
  id,
  turns,
  partial,
  busy,
  stage,
  onRetry,
  incident,
}: {
  id: string;
  turns: ConversationTurn[];
  partial: string;
  busy: boolean;
  stage: string;
  onRetry: (t: ConversationTurn) => void;
  incident: Incident;
}) {
  const [audio, setAudio] = useState(""),
    [away, setAway] = useState(false);
  const scroller = useRef<HTMLDivElement>(null),
    nearBottom = useRef(true);
  useEffect(() => {
    let alive = true,
      url = "";
    audioUrl(id)
      .then((v) => {
        url = v;
        if (alive) setAudio(v);
        else URL.revokeObjectURL(v);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);
  useEffect(() => {
    if (nearBottom.current) {
      scroller.current?.scrollTo({
        top: scroller.current.scrollHeight,
        behavior: "auto",
      });
    } else setAway(true);
  }, [turns, partial, stage]);
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      if (nearBottom.current) element.scrollTop = element.scrollHeight;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const jump = () => {
    nearBottom.current = true;
    setAway(false);
    scroller.current?.scrollTo({
      top: scroller.current.scrollHeight,
      behavior: "smooth",
    });
  };
  return (
    <div className="thread-wrap">
      <div
        className="conversation-thread"
        ref={scroller}
        onScroll={() => {
          const e = scroller.current!;
          nearBottom.current =
            e.scrollHeight - e.scrollTop - e.clientHeight < 90;
          if (nearBottom.current) setAway(false);
        }}
      >
        <div className="conversation-date">PRIVATE INCIDENT CONVERSATION</div>
        <div className="conversation-notice">
          You’re speaking with an AI coordinator in a simulation. You remain
          responsible for the decision.
        </div>
        {turns.map((t, index) => (
          <div key={t.id}>
            <MessageBubble
              speaker="officer"
              time={t.createdAt}
              text={t.officerText || "I have a caller recording to review."}
            >
              {index === 0 && audio && (
                <div className="chat-audio">
                  <span>
                    <Headphones size={14} /> Original recording
                  </span>
                  <audio controls src={audio} aria-label="Original recording" />
                </div>
              )}
            </MessageBubble>
            {t.reply && (
              <MessageBubble
                speaker="coordinator"
                text={t.reply}
                time={t.updatedAt}
              />
            )}{" "}
            {["failed", "interrupted"].includes(t.state) && (
              <div className="turn-failure" role="status">
                <strong>
                  {t.state === "interrupted"
                    ? "Response interrupted"
                    : "Assessment not completed"}
                </strong>
                <p>{conversationFailureMessage(t.failureCode)}</p>
                {index < turns.length - 1 ? (
                  <p>
                    A later message superseded this reply. Continue from the
                    latest message.
                  </p>
                ) : (
                  <button
                    disabled={busy || t.attempts >= 3}
                    onClick={() => onRetry(t)}
                  >
                    Retry response
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        {busy &&
          (partial ? (
            <MessageBubble speaker="coordinator" text={partial} provisional />
          ) : (
            <div className="coordinator-working" role="status">
              <span className="pulse-dot" />
              {stage || "Preparing response…"}
            </div>
          ))}
        {!busy && turns.some((t) => t.state === "processing") && (
          <p className="turn-failure" role="status">
            Recovering an interrupted response… Your report is saved.
          </p>
        )}
        {incident.assessment && (
          <details className="thread-assessment-drawer">
            <summary>
              <ClipboardList size={16} aria-hidden="true" />
              View detailed incident report
              <span>Service needs · evidence gaps</span>
            </summary>
            <IncidentReport incident={incident} />
          </details>
        )}
      </div>
      {away && (
        <button className="new-messages" onClick={jump}>
          <ArrowDown size={14} />
          New messages
        </button>
      )}
    </div>
  );
}
