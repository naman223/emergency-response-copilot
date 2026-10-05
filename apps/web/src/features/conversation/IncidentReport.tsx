import type { Incident } from "@copilot/contracts";
import { recommendedServices, serviceLabels } from "@copilot/contracts";
import { urgencyLabel } from "./IncidentContext";

const labels = {
  emergency: "Emergency",
  police: "Police response",
  medical: "Medical support",
  ambulance: "Ambulance",
  fire: "Fire response",
  weapon: "Weapon reported",
  injuries: "Injuries reported",
  immediateDanger: "Immediate danger now",
} as const;

export function IncidentReport({ incident }: { incident: Incident }) {
  const assessment = incident.assessment;
  if (!assessment) return null;
  return (
    <section className="incident-report" aria-label="AI incident report">
      <span className="caps">AI ASSESSMENT · HUMAN REVIEW REQUIRED</span>
      <h3>Incident report</h3>
      <p className="hint">
        {incident.intakeState === "ready"
          ? "Intake complete. Remaining unknowns are retained."
          : "Provisional report — updates as you answer essential questions."}
      </p>
      <p>{assessment.summary}</p>
      <dl className="report-overview">
        <div>
          <dt>Urgency</dt>
          <dd>{urgencyLabel(assessment.urgency)}</dd>
        </div>
        <div>
          <dt>Suggested services</dt>
          <dd>
            {recommendedServices(incident)
              .map((service) => serviceLabels[service])
              .join(", ") || "Unknown"}
          </dd>
        </div>
        <div>
          <dt>Reported location</dt>
          <dd>{assessment.locationDescription || "Unknown"}</dd>
        </div>
      </dl>
      <div className="report-indicators">
        {(Object.keys(labels) as Array<keyof typeof labels>).map((key) => {
          const indicator = assessment.indicators?.[key];
          const status = indicator?.status ?? "unknown";
          return (
            <div className="report-indicator" data-indicator={key} key={key}>
              <div>
                <strong>{labels[key]}</strong>
                <span className={`indicator-status ${status}`}>
                  {status === "yes"
                    ? "Yes"
                    : status === "no"
                      ? "No"
                      : "Unknown"}
                </span>
              </div>
              <p>{indicator?.reason ?? "Not assessed in this report."}</p>
            </div>
          );
        })}
      </div>
      {!!assessment.unknowns.length && (
        <details className="report-gaps">
          <summary>Remaining gaps ({assessment.unknowns.length})</summary>
          <ul>
            {assessment.unknowns.map((gap, index) => (
              <li key={index}>{gap}</li>
            ))}
          </ul>
        </details>
      )}
      <small>
        Reported information. Service needs are AI suggestions; human approval
        is separate.
      </small>
    </section>
  );
}
