import type { Incident } from "@copilot/contracts";
export function ClarificationDetails({ incident }: { incident: Incident }) {
  if (!incident.clarifications?.length) return null;
  return (
    <section className="clarification-details">
      <h3>Clarifications and updates ({incident.clarifications.length})</h3>
      <p className="hint">
        Full answers are retained in order. Later corrections may supersede
        earlier answers; the current assessment appears above.
      </p>
      <ol>
        {incident.clarifications.map((entry) => (
          <li key={entry.turnId}>
            <strong>{entry.question || "Officer update"}</strong>
            <p>{entry.answer}</p>
            {entry.assessmentState === "unassessed" && (
              <small>Saved, but not yet assessed by the coordinator.</small>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
