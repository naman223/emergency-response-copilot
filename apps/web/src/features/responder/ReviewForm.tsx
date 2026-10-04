import { useState } from "react";
import { Save, Check, MessageSquare, X } from "lucide-react";
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
  ) => Promise<void>;
}) {
  const [draft, setDraft] = useState<ReviewDraft>(
    incident.reviewDraft ?? {
      summary:
        incident.assessment?.summary ?? incident.brief?.explanation ?? "",
      urgency:
        incident.assessment?.urgency ?? incident.brief?.urgency ?? "unclear",
      routing:
        incident.assessment?.routing ?? incident.brief?.routing ?? "unclear",
      locationDescription:
        incident.assessment?.locationDescription ??
        incident.locationDescription ??
        "",
      confirmedFields: [],
    },
  );
  const [reason, setReason] = useState("");
  const [dirty, setDirty] = useState(!incident.reviewDraft);
  const locked =
    busy ||
    incident.analysisState === "processing" ||
    ["approved", "closed"].includes(incident.reviewState);
  function change<K extends keyof ReviewDraft>(key: K, value: ReviewDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setDirty(true);
  }
  return (
    <section className="card review-card">
      <div className="card-heading">
        <h2>Human verification</h2>
        <span className="tag">REQUIRED</span>
      </div>
      <p className="hint">
        Check the original audio. Edit suggestions before approving.
      </p>
      <fieldset disabled={locked}>
        <label className="field">
          Reviewer summary
          <textarea
            rows={3}
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
              <option value="unclear">Unclear</option>
            </select>
          </label>
          <label className="field">
            Suggested responder
            <select
              value={draft.routing}
              onChange={(e) =>
                change("routing", e.target.value as ReviewDraft["routing"])
              }
            >
              {["unclear", "police", "fire", "medical", "other"].map((v) => (
                <option key={v} value={v}>
                  {v[0].toUpperCase() + v.slice(1)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          Reviewed location description
          <input
            value={draft.locationDescription}
            onChange={(e) => change("locationDescription", e.target.value)}
          />
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={draft.confirmedFields.includes("locationDescription")}
            onChange={(e) =>
              change(
                "confirmedFields",
                e.target.checked ? ["locationDescription"] : [],
              )
            }
          />
          I verified this location description
        </label>
        <button
          className="secondary"
          disabled={!draft.summary.trim()}
          onClick={() => onSave(draft)}
        >
          <Save size={15} />
          Save review
        </button>
        <label className="field decision-reason">
          Decision reason
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="What did you verify, or what needs clarification?"
          />
        </label>
        <div className="decision-actions">
          <button
            className="primary"
            disabled={
              dirty ||
              !incident.reviewDraft ||
              !reason.trim() ||
              incident.contextVersion !== incident.reviewContextVersion
            }
            onClick={() => onDecide("approve", reason)}
          >
            <Check size={16} />
            Approve simulation
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
        {dirty && <p className="hint">Save your review to enable approval.</p>}
      </fieldset>
    </section>
  );
}
