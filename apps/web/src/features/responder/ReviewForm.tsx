import { useEffect, useState } from "react";
import { IncidentReport } from "../conversation/IncidentReport";
import { prefillReview } from "./review-draft";
import { LocationPicker } from "./LocationPicker";
import { ClarificationDetails } from "../conversation/ClarificationDetails";
import { ServiceMessages } from "../conversation/ServiceMessages";
import { urgencyLabel } from "../conversation/IncidentContext";
import {
  buildSmsPreviews,
  responseServices,
  serviceLabels,
  selectedServices,
  primaryRouting,
} from "@copilot/contracts";
import { Save, Check, MessageSquare, X, HeartPulse, Siren } from "lucide-react";
import type {
  Incident,
  ReviewDraft,
  DecisionRequest,
} from "@copilot/contracts";
export function ReviewForm({
  incident,
  busy,
  onSave,
  onDecide,
}: {
  incident: Incident;
  busy: boolean;
  onSave: (draft: ReviewDraft) => Promise<void>;
  onDecide: (
    action: DecisionRequest["action"],
    reason: string,
    draft?: ReviewDraft,
  ) => Promise<void>;
}) {
  const [draft, setDraft] = useState<ReviewDraft>(() =>
    prefillReview(incident),
  );
  const [reason, setReason] = useState(
    "Reviewed the available incident report and clarification history for this simulation.",
  );
  useEffect(() => {
    setDraft((current) => prefillReview({ ...incident, reviewDraft: current }));
  }, [
    incident.assessment,
    incident.brief,
    incident.reportText,
    incident.sourceTranscript,
    incident.contextVersion,
  ]);
  const assessmentPending =
    !incident.assessment &&
    !incident.brief &&
    !incident.reviewDraft &&
    (busy || ["pending", "processing"].includes(incident.analysisState));
  const locked =
    busy ||
    incident.analysisState === "processing" ||
    ["approved", "closed"].includes(incident.reviewState);
  const medicalSelected = selectedServices(draft).includes("medical");
  const PriorityIcon = medicalSelected ? HeartPulse : Siren;
  function change<K extends keyof ReviewDraft>(key: K, value: ReviewDraft[K]) {
    setDraft((d) => ({
      ...d,
      [key]: value,
      ...(["summary", "urgency", "routing", "locationDescription"].includes(key)
        ? {
            editedFields: [
              ...new Set([
                ...(d.editedFields ?? []),
                key as NonNullable<ReviewDraft["editedFields"]>[number],
              ]),
            ],
          }
        : {}),
      ...(key === "locationDescription"
        ? {
            confirmedFields: d.confirmedFields.filter(
              (f) => f !== "locationDescription",
            ),
            destinationName: "",
            selectedLocation: undefined,
          }
        : key === "routing" ||
            (key === "confirmedFields" &&
              !(value as string[]).includes("locationDescription"))
          ? { destinationName: "" }
          : {}),
    }));
  }
  return (
    <section
      className={`card review-card ${draft.urgency === "urgent_review" ? "urgent-review-card" : ""}`}
    >
      <div className="card-heading">
        <h2>Human verification</h2>
        <span className="tag">REQUIRED</span>
      </div>
      <div
        className="review-priority-note"
        role="region"
        aria-label="Review priority"
      >
        <PriorityIcon size={20} aria-hidden="true" />
        <div>
          <strong>
            {assessmentPending
              ? "Assessment pending"
              : draft.urgency === "urgent_review"
                ? medicalSelected
                  ? "Urgent medical review"
                  : "Urgent emergency review"
                : urgencyLabel(draft.urgency)}
          </strong>
          <span>
            {assessmentPending ? (
              "Recommendations pending"
            ) : (
              <>
                Review draft ·{" "}
                {selectedServices(draft)
                  .map((service) => serviceLabels[service])
                  .join(" + ") || "No services selected"}
              </>
            )}
          </span>
          {incident.assessment?.indicators && (
            <small>
              AI medical need:{" "}
              {incident.assessment.indicators.medical.status === "yes"
                ? "Yes"
                : incident.assessment.indicators.medical.status === "no"
                  ? "No"
                  : "Unknown"}{" "}
              · AI ambulance need:{" "}
              {incident.assessment.indicators.ambulance.status === "yes"
                ? "Yes"
                : incident.assessment.indicators.ambulance.status === "no"
                  ? "No"
                  : "Unknown"}
            </small>
          )}
        </div>
      </div>
      <p className="hint">
        {assessmentPending
          ? "Your report is saved. Urgency and service recommendations will appear after the initial assessment."
          : "Details are filled from the report and clarifications. Check or edit them, then approve to save and simulate dispatch in one step. Unknown information can stay unknown."}
      </p>
      <fieldset disabled={locked}>
        <button
          className="secondary send-review"
          disabled={!draft.summary.trim()}
          onClick={() => onSave(draft)}
        >
          <Save size={15} /> Save draft
        </button>
        <p className="hint">
          Optional: save your progress without approving or simulating dispatch.
        </p>
        <label className="field">
          Reviewer summary
          <textarea
            rows={3}
            maxLength={2000}
            value={draft.summary}
            onChange={(e) => change("summary", e.target.value)}
          />
        </label>
        <div className="field-pair">
          <label className="field">
            Reviewed urgency
            <select
              value={draft.urgency}
              onChange={(e) =>
                change("urgency", e.target.value as ReviewDraft["urgency"])
              }
            >
              <option value="urgent_review">Urgent review</option>
              <option value="standard_review">Standard review</option>
              <option value="unclear">
                {assessmentPending ? "Assessment pending" : "Unclear"}
              </option>
            </select>
          </label>
        </div>
        <fieldset className="service-selection">
          <legend>Services to notify</legend>
          <p className="hint">
            {assessmentPending
              ? "Service recommendations will appear after the initial assessment."
              : "Selected from the AI assessment. Choose all services needed for this incident."}
          </p>
          <div className="service-options">
            {responseServices.map((service) => (
              <label className="service-option" key={service}>
                <input
                  type="checkbox"
                  checked={selectedServices(draft).includes(service)}
                  onChange={(event) =>
                    setDraft((current) => {
                      const services = responseServices.filter((s) =>
                        s === service
                          ? event.target.checked
                          : selectedServices(current).includes(s),
                      );
                      return {
                        ...current,
                        services,
                        routing: primaryRouting(services),
                        destinationName: "",
                        editedFields: [
                          ...new Set([
                            ...(current.editedFields ?? []),
                            "services" as const,
                          ]),
                        ],
                      };
                    })
                  }
                />
                {serviceLabels[service]}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="field">
          Reviewed location description
          <input
            value={draft.locationDescription}
            maxLength={500}
            onChange={(e) => change("locationDescription", e.target.value)}
          />
        </label>
        <LocationPicker
          description={draft.locationDescription}
          selectedLocation={draft.selectedLocation}
          deviceLocation={incident.sourceLocation}
          verified={draft.confirmedFields.includes("locationDescription")}
          disabled={locked}
          onSelect={(description, selectedLocation) =>
            setDraft((d) => ({
              ...d,
              locationDescription: description,
              selectedLocation,
              destinationName: "",
              confirmedFields: [
                ...new Set([
                  ...d.confirmedFields,
                  "locationDescription" as const,
                ]),
              ],
              editedFields: [
                ...new Set([
                  ...(d.editedFields ?? []),
                  "locationDescription" as const,
                ]),
              ],
            }))
          }
        />
        <label className="check-label">
          <input
            type="checkbox"
            checked={draft.confirmedFields.includes("locationDescription")}
            onChange={(e) =>
              change(
                "confirmedFields",
                e.target.checked
                  ? [
                      ...new Set([
                        ...draft.confirmedFields,
                        "locationDescription" as const,
                      ]),
                    ]
                  : draft.confirmedFields.filter(
                      (field) => field !== "locationDescription",
                    ),
              )
            }
          />
          I verified this location description
          {draft.selectedLocation ? " and the coordinates above" : ""}
        </label>
        {draft.selectedLocation?.source === "device" && (
          <p className="hint">
            These coordinates come from the reporting device. Confirm that the
            incident is at this point, even if the report names a different
            site. Choose a point on the map or edit the description if it
            happened elsewhere.
          </p>
        )}
        <div className="nearby-services">
          <h3>Nearby service handoff</h3>
          {draft.locationDescription.trim() &&
          draft.confirmedFields.includes("locationDescription") ? (
            <a
              className="secondary"
              target="_blank"
              rel="noopener noreferrer"
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${draft.routing === "police" ? "police stations" : draft.routing === "fire" ? "fire stations" : draft.routing === "medical" ? "hospital emergency departments" : "emergency services"} near ${draft.selectedLocation ? `${draft.selectedLocation.latitude},${draft.selectedLocation.longitude}` : draft.locationDescription.trim()}`)}`}
            >
              Find nearby services in Google Maps
            </a>
          ) : (
            <p className="hint">
              Enter the full incident address or coordinates and verify it above
              to search nearby services.
            </p>
          )}
          <p className="hint">
            Maps opens real listings. Check suitability and contact details;
            proximity does not establish availability. No report is sent to a
            service.
          </p>
          <label className="field">
            Selected service for simulated handoff
            <input
              maxLength={300}
              value={draft.destinationName ?? ""}
              disabled={
                !draft.confirmedFields.includes("locationDescription") ||
                !draft.locationDescription.trim()
              }
              onChange={(e) => change("destinationName", e.target.value)}
              placeholder="Service name chosen by the reviewer"
            />
          </label>
        </div>
        {!!incident.assessment?.unknowns.length && (
          <div className="context-unknowns">
            <h3>Remaining unknowns</h3>
            <ul>
              {incident.assessment.unknowns.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
        )}
        {!!incident.assessment?.facts.length && (
          <details className="review-evidence">
            <summary>
              Reported facts ({incident.assessment.facts.length})
            </summary>
            <ul>
              {incident.assessment.facts.map((fact, index) => (
                <li key={index}>
                  <p>{fact.text}</p>
                  <blockquote>{fact.source.quote}</blockquote>
                  <small>
                    {fact.source.source === "officer"
                      ? "Officer-reported"
                      : "Caller-reported"}{" "}
                    ·{" "}
                    {fact.evidenceStatus === "matched"
                      ? "Quote matched to source"
                      : "Source unverified"}
                  </small>
                </li>
              ))}
            </ul>
          </details>
        )}
        {incident.reportText && (
          <details className="review-evidence">
            <summary>Original submitted report</summary>
            <p>{incident.reportText}</p>
          </details>
        )}
        {incident.sourceTranscript && (
          <details className="review-evidence">
            <summary>Original draft transcript</summary>
            <p>{incident.sourceTranscript}</p>
          </details>
        )}
        <ClarificationDetails incident={incident} />
        <IncidentReport incident={incident} />
        <ServiceMessages
          messages={buildSmsPreviews(
            incident.id,
            draft,
            window.location.origin,
          )}
        />
        <label className="field decision-reason">
          Decision reason
          <textarea
            rows={2}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="What did you verify, or what needs clarification?"
          />
        </label>
        <div className="decision-dock">
          <div className="decision-dock-label">
            <strong>Human decision</strong>
            <span>
              {assessmentPending ? (
                "Awaiting initial assessment"
              ) : (
                <>
                  {urgencyLabel(draft.urgency)} ·{" "}
                  {selectedServices(draft).length} services selected
                </>
              )}
            </span>
          </div>
          <div className="decision-actions">
            <button
              className="primary"
              disabled={
                !draft.summary.trim() ||
                !reason.trim() ||
                !selectedServices(draft).length
              }
              onClick={() => onDecide("approve", reason, draft)}
            >
              <Check size={16} />
              Approve &amp; simulate dispatch
            </button>
            <button
              className="secondary"
              disabled={!reason.trim()}
              onClick={() => onDecide("needs_clarification", reason)}
            >
              <MessageSquare size={15} />
              Clarify
            </button>
            <button
              className="text-button"
              disabled={!reason.trim()}
              onClick={() => onDecide("close", reason)}
            >
              <X size={15} />
              Close report
            </button>
          </div>
          <small className="decision-dock-note">
            Saves your review and records simulated notifications.
          </small>
        </div>
        <p className="hint">
          Approval saves the current review and records simulated SMS
          notifications for the selected services. No real service is contacted.
        </p>
        {!assessmentPending && !selectedServices(draft).length && (
          <p className="hint">
            Select at least one service to approve, or close the report.
          </p>
        )}
      </fieldset>
    </section>
  );
}
