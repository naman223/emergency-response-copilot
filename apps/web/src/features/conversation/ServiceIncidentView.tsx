import {
  serviceLabels,
  type Incident,
  type ResponseService,
} from "@copilot/contracts";
import { ReviewedIncident } from "./ReviewedIncident";

export function ServiceIncidentView({
  incident,
  service,
  onBack,
}: {
  incident: Incident;
  service: ResponseService;
  onBack: () => void;
}) {
  const message = incident.dispatchReceipt?.smsMessages?.find(
    (item) => item.service === service,
  );
  if (incident.reviewState !== "approved" || !message)
    return (
      <section className="service-incident-view">
        <h1>Notification unavailable</h1>
        <p>No approved simulated notification exists for this service.</p>
        <button onClick={onBack}>Open conversation</button>
      </section>
    );
  return (
    <section className="service-incident-view">
      <span className="caps">SERVICE RECIPIENT DEMO</span>
      <h1>{serviceLabels[service]} incident notification</h1>
      <p className="hint">
        This is a simulated recipient view, accessible within your authenticated
        demo session.
      </p>
      <article className="sms-card received-sms">
        <h2>Received SMS (simulation)</h2>
        <pre>{message.body}</pre>
      </article>
      <button className="secondary" onClick={onBack}>
        Open conversation
      </button>
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
      <ReviewedIncident incident={incident} />
    </section>
  );
}
