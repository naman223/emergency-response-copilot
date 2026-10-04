import type { Incident } from "@copilot/contracts";
import { CheckCircle2 } from "lucide-react";
import { urgencyLabel } from "./IncidentContext";
export function ReviewedIncident({
  incident,
  reason,
}: {
  incident: Incident;
  reason?: string;
}) {
  const d = incident.reviewDraft;
  return (
    <section className="final-incident">
      <span className="final-icon">
        <CheckCircle2 size={25} />
      </span>
      <span className="caps">HUMAN DECISION RECORDED</span>
      <h2>
        {incident.dispatchReceipt
          ? "Simulated dispatch complete"
          : "Report closed"}
      </h2>
      <p className="final-disclaimer">No emergency service was contacted.</p>
      {d && (
        <>
          <h3>Reviewed incident</h3>
          <p className="final-summary">{d.summary}</p>
          <dl>
            <div>
              <dt>Urgency</dt>
              <dd>{urgencyLabel(d.urgency)}</dd>
            </div>
            <div>
              <dt>Responder</dt>
              <dd>
                {d.routing === "unclear"
                  ? "Not determined"
                  : d.routing[0].toUpperCase() + d.routing.slice(1)}
              </dd>
            </div>
            <div className="full">
              <dt>Reviewed location</dt>
              <dd>{d.locationDescription || "Unknown"}</dd>
              <small>
                {d.confirmedFields.includes("locationDescription")
                  ? "Marked verified by the reviewer"
                  : "Not marked verified"}
              </small>
            </div>
          </dl>
        </>
      )}
      {reason && (
        <>
          <h3>Decision reason</h3>
          <p>{reason}</p>
        </>
      )}
      {!!incident.assessment?.unknowns.length && (
        <div className="context-unknowns">
          <h3>Remaining unknowns</h3>
          <ul>
            {incident.assessment.unknowns.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
        </div>
      )}
      {incident.dispatchReceipt && (
        <small className="receipt-ref">
          Simulation receipt {incident.dispatchReceipt.id.slice(0, 8)} ·
          reviewed version {incident.dispatchReceipt.approvedRevision}
        </small>
      )}
    </section>
  );
}
