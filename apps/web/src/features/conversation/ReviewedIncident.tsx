import type { Incident } from "@copilot/contracts";
import { selectedServices, serviceLabels } from "@copilot/contracts";
import { IncidentOutbox } from "./ServiceMessages";
import { CheckCircle2 } from "lucide-react";
import { urgencyLabel } from "./IncidentContext";
import { ClarificationDetails } from "./ClarificationDetails";
import { IncidentReport } from "./IncidentReport";
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
              <dt>
                {incident.dispatchReceipt
                  ? "Services notified (simulation)"
                  : "Selected services"}
              </dt>
              <dd>
                {selectedServices(d)
                  .map((service) => serviceLabels[service])
                  .join(", ") || "Not determined"}
              </dd>
            </div>
            <div className="full">
              <dt>Reviewed location</dt>
              <dd>{d.locationDescription || "Unknown"}</dd>
              {d.selectedLocation && (
                <p>
                  Map-selected point: {d.selectedLocation.latitude.toFixed(6)},{" "}
                  {d.selectedLocation.longitude.toFixed(6)}
                </p>
              )}
              <small>
                {d.confirmedFields.includes("locationDescription")
                  ? "Marked verified by the reviewer"
                  : "Not marked verified"}
              </small>
            </div>
          </dl>
          {d.destinationName && (
            <>
              <h3>Simulated handoff destination</h3>
              <p>{d.destinationName}</p>
              <small>
                Selected by the human reviewer. No service was contacted.
              </small>
            </>
          )}
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
      <ClarificationDetails incident={incident} />
      <IncidentOutbox incident={incident} />
      <IncidentReport incident={incident} />
    </section>
  );
}
