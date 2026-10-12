import { useState } from "react";
import { ArrowUp } from "lucide-react";
export function MessageComposer({
  disabled,
  onSend,
  suggestions,
}: {
  disabled: boolean;
  onSend: (text: string) => Promise<void>;
  suggestions: string[];
}) {
  const [text, setText] = useState("");
  async function send(value = text) {
    if (disabled || !value.trim()) return;
    setText("");
    await onSend(value.trim());
  }
  return (
    <div className="composer-wrap">
      {suggestions.length > 0 && (
        <div className="suggested-replies">
          <span>Suggested replies</span>
          {suggestions.map((s) => (
            <button key={s} disabled={disabled} onClick={() => send(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      <form
        className="chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          aria-label="Message the coordinator"
          placeholder="Share an update or ask the coordinator…"
          rows={2}
          maxLength={2000}
          disabled={disabled}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button aria-label="Send message" disabled={disabled || !text.trim()}>
          <ArrowUp size={20} />
        </button>
      </form>
      <p className="composer-footnote">
        AI suggestions need human verification. Enter to send · Shift + Enter
        for a new line
      </p>
    </div>
  );
}
