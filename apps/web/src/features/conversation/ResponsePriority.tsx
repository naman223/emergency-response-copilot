import {
  Ambulance,
  CheckCheck,
  CircleHelp,
  HeartPulse,
  MapPin,
  ShieldAlert,
  Siren,
  ChevronDown,
} from "lucide-react";
import { useState } from "react";
import {
  recommendedServices,
  selectedServices,
  serviceLabels,
  type Incident,
} from "@copilot/contracts";
import { urgencyLabel } from "./IncidentContext";

const needs = [
  { key: "medical", label: "Medical support", Icon: HeartPulse },
  { key: "ambulance", label: "Ambulance", Icon: Ambulance },
  { key: "emergency", label: "Emergency", Icon: Siren },
] as const;

export function ResponsePriority({
  incident,
  busy,
}: {
  incident: Incident;
  busy: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const a = incident.assessment;
  if (!a) return null;
  const handedOff = !!incident.dispatchReceipt;
  const closed = handedOff || incident.reviewState === "closed";
  const reviewed = closed && !!incident.reviewDraft;
  const urgency = closed
    ? (incident.reviewDraft?.urgency ?? a.urgency)
    : a.urgency;
  const medical =
    a.indicators?.medical.status === "yes" ||
    a.indicators?.ambulance.status === "yes" ||
    a.routing === "medical";
  const tone = handedOff
    ? "complete"
    : closed
      ? "closed"
      : urgency === "urgent_review"
        ? "urgent"
        : urgency === "standard_review"
          ? "standard"
          : "unclear";
  const Icon = handedOff
    ? CheckCheck
    : closed
      ? ShieldAlert
      : medical
        ? HeartPulse
        : urgency === "urgent_review"
          ? Siren
          : CircleHelp;
  const title = handedOff
    ? "Simulated handoff recorded"
    : closed
      ? "Report closed by reviewer"
      : urgency === "urgent_review"
        ? medical
          ? "Urgent medical review"
          : "Urgent emergency review"
        : urgency === "standard_review"
          ? "Standard review"
          : "Urgency not established";
  const services =
    closed && incident.reviewDraft
      ? selectedServices(incident.reviewDraft)
      : recommendedServices(incident);
  const location =
    closed && incident.reviewDraft
      ? incident.reviewDraft.locationDescription
      : a.locationDescription || incident.locationDescription;
  const phase = handedOff
    ? 3
    : closed
      ? 2
      : busy
        ? 1
        : incident.intakeState === "ready"
          ? 2
          : 1;
  const stages = [
    { key: "report", label: "Report received", detail: "Voice or text" },
    {
      key: "assessment",
      label: "AI assessment",
      detail: busy
        ? "Updating…"
        : phase === 1
          ? "Clarifying essentials"
          : "Assessment available",
    },
    {
      key: "review",
      label: "Human decision",
      detail: closed
        ? "Decision recorded"
        : phase === 2
          ? "Ready for review"
          : "Approval required",
    },
    {
      key: "handoff",
      label: closed && !handedOff ? "Handoff skipped" : "Simulated handoff",
      detail: handedOff
        ? "Receipt saved"
        : closed
          ? "Report closed"
          : "Awaiting approval",
    },
  ];
  return (
    <section
      className={`response-priority compact ${tone}`}
      aria-label="Response priority"
      data-priority={tone}
    >
      <div className="response-priority-heading">
        <span className="response-priority-icon">
          <Icon size={24} aria-hidden="true" />
        </span>
        <div className="response-priority-title" role="status">
          <span className="response-eyebrow">
            {closed
              ? "HUMAN DECISION RECORDED"
              : "AI ASSESSMENT · HUMAN REVIEW REQUIRED"}
          </span>
          <h2>{title}</h2>
        </div>
        <button
          className="priority-details-toggle"
          aria-label={
            expanded ? "Hide priority details" : "Show priority details"
          }
          aria-expanded={expanded}
          aria-controls={`priority-details-${incident.id}`}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Less" : "Details"}
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      </div>
      <div className="priority-service-line">
        {closed && (
          <span>
            {reviewed ? "Reviewed priority" : "AI priority"}:{" "}
            <strong>{urgencyLabel(urgency)}</strong>
          </span>
        )}
        <span>
          {reviewed ? "Selected" : "Suggested"}:{" "}
          <strong>
            {services.map((s) => serviceLabels[s]).join(" + ") ||
              "Not determined"}
          </strong>
        </span>
        {!closed && medical && (
          <span className="priority-inline-need" data-priority-need="ambulance">
            AI ambulance:{" "}
            <strong>
              {a.indicators?.ambulance.status === "yes"
                ? "Yes"
                : a.indicators?.ambulance.status === "no"
                  ? "No"
                  : "Unknown"}
            </strong>
          </span>
        )}
        {closed && (
          <span className="handoff-simulation-note">
            No real service contacted
          </span>
        )}
      </div>
      <div
        id={`priority-details-${incident.id}`}
        className="priority-details"
        hidden={!expanded}
      >
        {!closed && (
          <div className="priority-needs" aria-label="AI response needs">
            {needs.map(({ key, label, Icon: NeedIcon }) => {
              const status = a.indicators?.[key]?.status ?? "unknown";
              return (
                <div
                  key={key}
                  className={`priority-need ${status}`}
                  data-need={key}
                >
                  <NeedIcon size={17} aria-hidden="true" />
                  <span>{label}</span>
                  <strong>
                    {status === "yes"
                      ? "Yes"
                      : status === "no"
                        ? "No"
                        : "Unknown"}
                  </strong>
                </div>
              );
            })}
          </div>
        )}
        <div className="priority-location">
          <MapPin size={14} aria-hidden="true" />
          <span>{location || "Incident location not supplied"}</span>
          <small>{reviewed ? "Reviewed location" : "Reported · verify"}</small>
        </div>
        <ol className="response-stages" aria-label="Incident response progress">
          {stages.map((step, index) => (
            <li
              key={step.key}
              data-phase={step.key}
              className={
                index < phase ? "done" : index === phase ? "current" : "waiting"
              }
              aria-current={index === phase ? "step" : undefined}
            >
              <span className="stage-marker" aria-hidden="true">
                {index < phase ? <CheckCheck size={11} /> : index + 1}
              </span>
              <div>
                <strong>{step.label}</strong>
                <small>{step.detail}</small>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
