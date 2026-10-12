import type { Incident } from "@copilot/contracts";
import {
  recommendedServices,
  serviceLabels,
  reconcileUnknowns,
} from "@copilot/contracts";
import { urgencyLabel } from "./IncidentContext";
import {
  Ambulance,
  Flame,
  HeartPulse,
  HelpCircle,
  ShieldAlert,
  Siren,
  Users,
  Zap,
} from "lucide-react";

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
const icons = {
  emergency: Siren,
  police: ShieldAlert,
  medical: HeartPulse,
  ambulance: Ambulance,
  fire: Flame,
  weapon: ShieldAlert,
  injuries: Users,
  immediateDanger: Zap,
};

export function IncidentReport({ incident }: { incident: Incident }) {
  const assessment = incident.assessment;
  if (!assessment) return null;
  const unknowns = reconcileUnknowns(assessment);
  return (
    <section
      className={`incident-report ${assessment.urgency === "urgent_review" ? "urgent-report" : ""}`}
      aria-label="AI incident report"
    >
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
          const Icon = status === "unknown" ? HelpCircle : icons[key];
          return (
            <div
              className={`report-indicator need-${status}`}
              data-indicator={key}
              key={key}
            >
              <div>
                <strong>
                  <Icon size={16} aria-hidden="true" />
                  {labels[key]}
                </strong>
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
      {!!unknowns.length && (
        <details className="report-gaps">
          <summary>Remaining gaps ({unknowns.length})</summary>
          <ul>
            {unknowns.map((gap, index) => (
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
