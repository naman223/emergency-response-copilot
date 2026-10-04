import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Headphones,
  MapPin,
  ShieldCheck,
  Clock,
  Inbox,
} from "lucide-react";
import type {
  Incident,
  ReviewDraft,
  DecisionRequest,
} from "@copilot/contracts";
import { audioUrl, apiRequest } from "../../api";
import { ReviewForm } from "./ReviewForm";
export function ResponderView({
  incidents,
  selected,
  busy,
  onSelect,
  onSave,
  onDecide,
  onRetry,
}: {
  incidents: Incident[];
  selected?: Incident;
  busy: boolean;
  onSelect: (id: string) => void;
  onSave: (draft: ReviewDraft) => Promise<void>;
  onDecide: (
    action: DecisionRequest["action"],
    reason: string,
  ) => Promise<void>;
  onRetry: () => void;
}) {
  const [audio, setAudio] = useState(""),
    [audioError, setAudioError] = useState(""),
    [history, setHistory] = useState<
      Array<{ id: string; action: string; at: string; reason?: string }>
    >([]);
  useEffect(() => {
    let disposed = false,
      url = "";
    setAudio("");
    setAudioError("");
    if (selected)
      audioUrl(selected.id)
        .then((v) => {
          url = v;
          if (!disposed) setAudio(v);
          else URL.revokeObjectURL(v);
        })
        .catch(() => {
          if (!disposed) setAudioError("Recording unavailable. Try reloading.");
        });
    return () => {
      disposed = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [selected?.id]);
  useEffect(() => {
    let disposed = false;
    if (selected)
      apiRequest<typeof history>(`/incidents/${selected.id}/history`)
        .then((h) => {
          if (!disposed) setHistory(h);
        })
        .catch(() => {});
    return () => {
      disposed = true;
    };
  }, [selected?.id, selected?.revision]);
  const priority =
    selected?.reviewDraft?.urgency ?? selected?.brief?.urgency ?? "unclear";
  return (
    <>
      <div className="desk-heading">
        <div>
          <span className="eyebrow">RESPONDER WORKSPACE</span>
          <h1>Every detail matters.</h1>
          <p>Review the evidence. Keep the decision human.</p>
        </div>
        <span className="queue-count">
          <Inbox size={18} />
          {incidents.length} report{incidents.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="desk-grid">
        <aside className="card queue">
          <div className="card-heading">
            <h2>Incident queue</h2>
            <span>{incidents.length}</span>
          </div>
          {!incidents.length ? (
            <p className="empty-queue">Your incident queue is empty.</p>
          ) : (
            incidents.map((i) => (
              <button
                key={i.id}
                className={`queue-item ${selected?.id === i.id ? "active" : ""}`}
                onClick={() => onSelect(i.id)}
              >
                <span className={`dot ${i.brief?.urgency ?? ""}`} />
                <div>
                  <strong>Report {i.id.slice(0, 6).toUpperCase()}</strong>
                  <span>{i.brief?.facts[0]?.text ?? "Awaiting review"}</span>
                  <small>
                    {i.reviewState.replaceAll("_", " ")} ·{" "}
                    {new Date(i.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </small>
                </div>
              </button>
            ))
          )}
        </aside>
        {!selected ? (
          <section className="card empty-state">
            <ShieldCheck size={48} />
            <h2>Ready when a report arrives.</h2>
            <p>
              Submit a sample from Caller intake to follow the complete review
              workflow.
            </p>
          </section>
        ) : (
          <div className="incident-column">
            <section className="card brief-card">
              <div className="card-heading">
                <div>
                  <span className="eyebrow">
                    REPORT {selected.id.slice(0, 6).toUpperCase()}
                  </span>
                  <h2>Incident brief</h2>
                </div>
                <span className={`priority ${priority}`}>
                  <AlertCircle size={14} />
                  {priority.replaceAll("_", " ")}
                </span>
              </div>
              <div className="brief-meta">
                <span>
                  <Clock size={14} />
                  {new Date(selected.createdAt).toLocaleString()}
                </span>
                <span>
                  {selected.analysisMode === "fixture"
                    ? "Prepared fixture result"
                    : "Gemini-generated draft"}
                </span>
              </div>
              {selected.analysisState === "processing" ? (
                <div className="processing">
                  <span className="spinner" />
                  Organizing the report…
                </div>
              ) : selected.analysisState === "failed" ? (
                <div className="failure" role="status">
                  <strong>Analysis unavailable</strong>
                  <p>
                    {selected.failureCode === "FIXTURE_ONLY"
                      ? "This local mode analyzes the provided samples only. You can review this recording manually."
                      : "The original recording is preserved. Retry or complete the review manually."}
                  </p>
                </div>
              ) : null}
              {selected.analysisState === "pending" ||
              selected.analysisState === "failed" ? (
                <button
                  className="secondary"
                  disabled={
                    busy ||
                    !!selected.reviewDraft ||
                    ["approved", "closed"].includes(selected.reviewState)
                  }
                  onClick={onRetry}
                >
                  Retry analysis
                </button>
              ) : null}
              <div className="audio-player">
                <Headphones size={20} />
                <div>
                  <strong>Original recording</strong>
                  {audio ? (
                    <audio
                      aria-label="Original recording"
                      controls
                      src={audio}
                    />
                  ) : (
                    <p className="hint">{audioError || "Loading recording…"}</p>
                  )}
                </div>
              </div>
              {selected.brief && (
                <>
                  <div className="facts-heading">
                    <h3>Caller-reported facts</h3>
                    <span>Verify against the recording</span>
                  </div>
                  <div className="facts">
                    {selected.brief.facts.map((f, index) => (
                      <div className="fact" key={index}>
                        <span className="evidence-mark">{index + 1}</span>
                        <div>
                          <strong>{f.text}</strong>
                          <blockquote>
                            “{f.quote || "No supporting quote"}”
                          </blockquote>
                          <span
                            className={`evidence-label ${f.evidenceStatus}`}
                          >
                            {f.evidenceStatus === "matched"
                              ? "Quote matched to draft transcript"
                              : "Evidence unverified"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <details>
                    <summary>Read draft transcript</summary>
                    <p className="transcript">{selected.brief.transcript}</p>
                  </details>
                  <div className="unknowns">
                    <h3>Still to verify</h3>
                    {selected.brief.unknowns.length ? (
                      <ul>
                        {selected.brief.unknowns.map((v, index) => (
                          <li key={index}>{v}</li>
                        ))}
                      </ul>
                    ) : (
                      <p>
                        No additional unknowns listed by the analysis. Human
                        verification is still required.
                      </p>
                    )}
                  </div>
                  <div className="routing">
                    <span>AI-suggested routing</span>
                    <strong>{selected.brief.routing.toUpperCase()}</strong>
                    <p>{selected.brief.explanation}</p>
                  </div>
                </>
              )}
              <div className="location-block">
                <MapPin size={18} />
                <div>
                  <strong>Location context</strong>
                  <p>
                    {selected.sourceLocation
                      ? `${selected.sourceLocation.source === "sample" ? "Simulated" : "Device-reported"}: ${selected.sourceLocation.latitude.toFixed(5)}, ${selected.sourceLocation.longitude.toFixed(5)}`
                      : selected.locationDescription ||
                        "Unknown — not provided"}
                  </p>
                  {selected.sourceLocation && (
                    <p className="hint">
                      Reported accuracy:{" "}
                      {selected.sourceLocation.accuracyMeters !== undefined
                        ? `${selected.sourceLocation.accuracyMeters.toFixed(1)} m`
                        : "unknown"}{" "}
                      · Captured{" "}
                      {new Date(
                        selected.sourceLocation.capturedAt,
                      ).toLocaleTimeString()}{" "}
                      · Verification required
                    </p>
                  )}
                </div>
              </div>
            </section>
            {selected.reviewDraft &&
              ["approved", "closed"].includes(selected.reviewState) && (
                <section className="card reviewed-report">
                  <span className="eyebrow">HUMAN REVIEW</span>
                  <h2>Reviewed incident</h2>
                  <p>{selected.reviewDraft.summary}</p>
                  <dl>
                    <dt>Reviewed urgency</dt>
                    <dd>{selected.reviewDraft.urgency.replaceAll("_", " ")}</dd>
                    <dt>Reviewed routing</dt>
                    <dd>{selected.reviewDraft.routing.toUpperCase()}</dd>
                    <dt>Reviewed location</dt>
                    <dd>
                      {selected.reviewDraft.locationDescription ||
                        "Unknown — not provided"}
                    </dd>
                  </dl>
                  <p className="hint">
                    Explicitly confirmed fields:{" "}
                    {selected.reviewDraft.confirmedFields.join(", ") || "None"}
                  </p>
                  {selected.dispatchReceipt && (
                    <p className="hint">
                      Approved revision{" "}
                      {selected.dispatchReceipt.approvedRevision}
                    </p>
                  )}
                </section>
              )}
            {selected.dispatchReceipt ? (
              <section className="receipt">
                <CheckCircle2 size={28} />
                <div>
                  <h2>Simulated dispatch complete</h2>
                  <p>No emergency service was contacted.</p>
                  <code>Receipt {selected.dispatchReceipt.id.slice(0, 8)}</code>
                </div>
              </section>
            ) : selected.reviewState === "closed" ? (
              <section className="card">
                <h2>Report closed</h2>
                <p>The recording and decision history remain available.</p>
              </section>
            ) : (
              <ReviewForm
                key={`${selected.id}-${selected.revision}`}
                incident={selected}
                busy={busy}
                onSave={onSave}
                onDecide={onDecide}
              />
            )}
            <section className="card history">
              <h2>Decision history</h2>
              {history.length ? (
                <ol>
                  {history.map((e) => (
                    <li key={e.id}>
                      <span className="history-dot" />
                      <div>
                        <strong>
                          {e.action === "edit"
                            ? "Review saved"
                            : e.action === "approve"
                              ? "Simulation approved"
                              : e.action.replaceAll("_", " ")}
                        </strong>
                        {e.reason && <p>{e.reason}</p>}
                        <small>{new Date(e.at).toLocaleTimeString()}</small>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="hint">No human decisions recorded yet.</p>
              )}
            </section>
          </div>
        )}
      </div>
    </>
  );
}
