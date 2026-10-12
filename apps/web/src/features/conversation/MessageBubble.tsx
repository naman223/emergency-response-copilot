import { Radio, UserRound } from "lucide-react";
export function MessageBubble({
  speaker,
  text,
  time,
  children,
  provisional = false,
}: {
  speaker: "officer" | "coordinator";
  text?: string;
  time?: string;
  children?: React.ReactNode;
  provisional?: boolean;
}) {
  return (
    <article className={`message-row ${speaker}`}>
      <div className="message-avatar">
        {speaker === "coordinator" ? (
          <Radio size={17} />
        ) : (
          <UserRound size={17} />
        )}
      </div>
      <div className="message-body">
        <div className="message-byline">
          <strong>
            {speaker === "coordinator"
              ? "AI coordinator"
              : "You · Security officer"}
          </strong>
          {time && (
            <time>
              {new Date(time).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          )}
          {provisional && <span>Responding</span>}
        </div>
        <div className={`message-bubble ${provisional ? "provisional" : ""}`}>
          {text && <p>{text}</p>}
          {children}
        </div>
      </div>
    </article>
  );
}
