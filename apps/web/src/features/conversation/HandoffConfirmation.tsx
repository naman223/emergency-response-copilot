import { useEffect, useRef } from "react";
import { CheckCircle2, MapPin, Phone, Siren } from "lucide-react";
import { serviceLabels, type Incident } from "@copilot/contracts";
import { urgencyLabel } from "./IncidentContext";

export type HandoffView = "confirmation" | "sos" | null;

export function HandoffConfirmation({
  incident,
  view,
  onView,
}: {
  incident: Incident;
  view: HandoffView;
  onView: (view: HandoffView) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const dismiss = useRef<HTMLButtonElement>(null);
  const phone = useRef<HTMLAnchorElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const receipt = incident.dispatchReceipt;
  const messages = receipt?.smsMessages ?? [];
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (view) {
      if (!element.open) element.showModal();
      if (view === "sos") phone.current?.focus();
      else dismiss.current?.focus();
    } else if (element.open) {
      element.close();
      trigger.current?.focus();
    }
  }, [view]);
  if (!receipt || !messages.length) return null;
  const location =
    incident.reviewDraft?.locationDescription || "Location not supplied";
  return (
    <>
      <div className="handoff-actions">
        <button
          ref={trigger}
          className="handoff-receipt-button"
          onClick={() => onView("confirmation")}
        >
          <CheckCircle2 size={15} aria-hidden="true" /> View notification
          receipt
        </button>
        <button className="handoff-sos-button" onClick={() => onView("sos")}>
          <Siren size={16} aria-hidden="true" /> SOS — immediate help
        </button>
      </div>
      <dialog
        ref={dialog}
        className={`handoff-dialog ${view === "sos" ? "sos-dialog" : ""}`}
        aria-labelledby={`handoff-title-${incident.id}`}
        aria-describedby={`handoff-description-${incident.id}`}
        onCancel={() => onView(null)}
        onClose={() => {
          onView(null);
          trigger.current?.focus();
        }}
      >
        <div className="handoff-dialog-heading">
          <span className="handoff-dialog-icon">
            {view === "sos" ? (
              <Siren size={27} aria-hidden="true" />
            ) : (
              <CheckCircle2 size={27} aria-hidden="true" />
            )}
          </span>
          <div>
            <span className="caps">
              {view === "sos"
                ? "DIRECT EMERGENCY CONTACT"
                : "SIMULATION RECEIPT"}
            </span>
            <h2 id={`handoff-title-${incident.id}`}>
              {view === "sos"
                ? "Get immediate help"
                : "Service messages recorded"}
            </h2>
          </div>
        </div>
        <div className="handoff-dialog-body">
          {view === "sos" ? (
            <>
              <p id={`handoff-description-${incident.id}`}>
                This demo cannot send an SOS or arrange emergency help. If help
                is needed now, contact emergency services directly.
              </p>
              <a ref={phone} className="emergency-call-button" href="tel:112">
                <Phone size={19} aria-hidden="true" /> Call 112 — India
              </a>
              <p className="emergency-call-note">
                Opens your device’s calling app. You must place the call
                yourself. If calling is unavailable here, dial 112 from a phone
                in India. Outside India, use your local emergency number.
              </p>
              <section
                className="sos-incident-brief"
                aria-label="Incident brief for your call"
              >
                <h3>Information to share</h3>
                <p>
                  <strong>Location:</strong> {location}
                </p>
                <p>
                  <strong>Location verification:</strong>{" "}
                  {incident.reviewDraft?.confirmedFields.includes(
                    "locationDescription",
                  )
                    ? "Reviewer verified"
                    : "Not verified as the incident location"}
                </p>
                {incident.reviewDraft?.selectedLocation && (
                  <p>
                    <strong>
                      {incident.reviewDraft.selectedLocation.source === "device"
                        ? "Device GPS"
                        : "Map pin"}
                      :
                    </strong>{" "}
                    {incident.reviewDraft.selectedLocation.latitude.toFixed(6)},{" "}
                    {incident.reviewDraft.selectedLocation.longitude.toFixed(6)}
                  </p>
                )}
                <p>
                  <strong>Reviewed urgency:</strong>{" "}
                  {urgencyLabel(incident.reviewDraft?.urgency)}
                </p>
                <p>
                  {incident.reviewDraft?.summary ||
                    incident.reportText ||
                    "Incident details unavailable."}
                </p>
              </section>
              <a
                className="emergency-source"
                href="https://112.gov.in/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Official 112 India emergency information
              </a>
            </>
          ) : (
            <>
              <p id={`handoff-description-${incident.id}`}>
                Your incident is saved. Messages for these services have been
                recorded in the dispatch simulator.
              </p>
              <ul
                className="handoff-recipient-list"
                aria-label="Notified services in this simulation"
              >
                {messages.map((message) => (
                  <li key={message.service}>
                    <CheckCircle2 size={17} aria-hidden="true" />
                    <strong>{serviceLabels[message.service]}</strong>
                    <span>SMS recorded</span>
                  </li>
                ))}
              </ul>
              <div className="handoff-location">
                <MapPin size={17} aria-hidden="true" />
                <span>{location}</span>
              </div>
              <p className="handoff-simulation-warning">
                No real emergency service was contacted. No responder
                acknowledgement or arrival time is available. For immediate
                help, use SOS to access emergency calling.
              </p>
              <small className="handoff-receipt-reference">
                Receipt {receipt.id.slice(0, 8)} ·{" "}
                {new Date(receipt.createdAt).toLocaleString()}
              </small>
            </>
          )}
        </div>
        <div className="handoff-dialog-footer">
          {view === "sos" ? (
            <>
              <button
                className="handoff-receipt-button"
                onClick={() => onView("confirmation")}
              >
                Back to confirmation
              </button>
              <button
                ref={dismiss}
                className="handoff-dismiss-button"
                onClick={() => onView(null)}
              >
                Close help
              </button>
            </>
          ) : (
            <>
              <button
                className="handoff-sos-button"
                onClick={() => onView("sos")}
              >
                <Siren size={17} aria-hidden="true" /> SOS — immediate help
              </button>
              <button
                ref={dismiss}
                className="handoff-dismiss-button"
                onClick={() => onView(null)}
              >
                View incident
              </button>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
