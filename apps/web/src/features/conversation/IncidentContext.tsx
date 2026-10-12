import type { Incident } from "@copilot/contracts";
import { reconcileUnknowns } from "@copilot/contracts";
import { MapPin, ShieldCheck, HelpCircle } from "lucide-react";
import { ClarificationDetails } from "./ClarificationDetails";
export const urgencyLabel = (v?: string) =>
  v === "urgent_review"
    ? "Urgent review"
    : v === "standard_review"
      ? "Standard review"
      : "Unclear";
export function IncidentContext({
  incident,
  onReview,
}: {
  incident: Incident;
  onReview: () => void;
}) {
  const a = incident.assessment;
  const unknowns = a ? reconcileUnknowns(a) : [];
  return (
    <section className="context-content">
      <div className="context-title">
        <span className="caps">UPDATING AS YOU TALK</span>
        <h2>Incident context</h2>
      </div>
      <span className={`context-priority ${a?.urgency ?? ""}`}>
        {urgencyLabel(a?.urgency)}
      </span>
      <h3>Current assessment</h3>
      <p className="assessment-summary">
        {a?.summary ??
          "The report is saved. Context will appear after a completed coordinator response, or you can enter a manual review."}
      </p>
      <div className="context-routing">
        <ShieldCheck size={17} />
        <div>
          <span>Suggested responder</span>
          <strong>
            {a?.routing && a.routing !== "unclear"
              ? a.routing[0].toUpperCase() + a.routing.slice(1)
              : "Not determined"}
          </strong>
        </div>
      </div>
      <div className="context-location">
        <MapPin size={17} />
        <div>
          <strong>Reported location</strong>
          <p>
            {a?.locationDescription ||
              incident.locationDescription ||
              "Unknown — needs clarification"}
          </p>
          {incident.sourceLocation && (
            <p>
              Device: {incident.sourceLocation.latitude.toFixed(5)},{" "}
              {incident.sourceLocation.longitude.toFixed(5)} · accuracy{" "}
              {incident.sourceLocation.accuracyMeters?.toFixed(1) ?? "unknown"}{" "}
              m
            </p>
          )}
          <small>Reported information · verify before acting</small>
        </div>
      </div>
      {!!a?.facts.length && (
        <>
          <h3>Supporting information</h3>
          <div className="context-facts">
            {a.facts.map((f, i) => (
              <details key={i}>
                <summary>{f.text}</summary>
                <blockquote>“{f.source.quote}”</blockquote>
                <small>
                  {f.source.source === "officer"
                    ? "Officer-reported"
                    : "Caller-reported"}{" "}
                  ·{" "}
                  {f.evidenceStatus === "matched"
                    ? "quote matched to source text"
                    : "evidence unverified"}
                </small>
              </details>
            ))}
          </div>
        </>
      )}
      {!!unknowns.length && (
        <div className="context-unknowns">
          <h3>
            <HelpCircle size={16} />
            Still unknown
          </h3>
          <ul>
            {unknowns.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
        </div>
      )}
      {incident.sourceTranscript && (
        <details className="source-transcript">
          <summary>Original draft transcript</summary>
          <p>{incident.sourceTranscript}</p>
          <small>Check against the original recording.</small>
        </details>
      )}
      {incident.reportText && (
        <details className="source-transcript">
          <summary>Original submitted report</summary>
          <p>{incident.reportText}</p>
        </details>
      )}
      <ClarificationDetails incident={incident} />
      <button className="primary review-context" onClick={onReview}>
        Open human review
      </button>
    </section>
  );
}
