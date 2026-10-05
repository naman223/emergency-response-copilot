import {
  serviceLabels,
  type Incident,
  type SmsPreview,
} from "@copilot/contracts";

export function ServiceMessages({
  messages,
  sentAt,
}: {
  messages: SmsPreview[];
  sentAt?: string;
}) {
  return (
    <section
      className="service-messages"
      aria-label={sentAt ? "Simulated SMS outbox" : "SMS preview"}
    >
      <h3>
        {sentAt ? "SMS sent (simulation)" : "SMS preview for selected services"}
      </h3>
      <p className="hint">
        {sentAt
          ? `${messages.length} simulated notifications recorded. No real SMS or emergency service contact occurred.`
          : "Approval records one simulated SMS per selected service. Review the messages before approving."}
      </p>
      {messages.map((message) => (
        <article
          className="sms-card"
          data-service={message.service}
          key={message.service}
        >
          <div className="sms-heading">
            <strong>{serviceLabels[message.service]}</strong>
            <span className="tag">{sentAt ? "SIMULATED SENT" : "PREVIEW"}</span>
          </div>
          {sentAt && <small>{new Date(sentAt).toLocaleString()}</small>}
          <pre>{message.body}</pre>
          {sentAt && (
            <a
              href={message.detailsUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open {serviceLabels[message.service]} incident view
            </a>
          )}
        </article>
      ))}
      {!messages.length && (
        <p className="hint">Select at least one service to preview its SMS.</p>
      )}
    </section>
  );
}

export function IncidentOutbox({ incident }: { incident: Incident }) {
  const receipt = incident.dispatchReceipt;
  if (!receipt?.smsMessages?.length) return null;
  return (
    <ServiceMessages
      messages={receipt.smsMessages}
      sentAt={receipt.createdAt}
    />
  );
}
