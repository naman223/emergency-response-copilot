import { randomUUID } from "node:crypto";
import type {
  Incident,
  ReviewDraft,
  DecisionRequest,
} from "@copilot/contracts";
import { assertSession, sessionKey, type Session } from "../auth/session";
import { own, incidentKey } from "../incidents/service";
import type { Database } from "../infra/repository";
import { requireCondition } from "../errors";
export class ReviewService {
  constructor(private db: Database) {}
  async save(
    session: Session,
    id: string,
    expectedRevision: number,
    draft: ReviewDraft,
  ) {
    const key = incidentKey(id),
      sk = sessionKey(session.uid);
    return this.db.transact([key, sk], (docs) => {
      const s = assertSession(docs[sk]),
        r = own(docs[key], s);
      this.editable(r.incident, expectedRevision);
      requireCondition(
        !draft.destinationName?.trim() ||
          (draft.locationDescription.trim() &&
            draft.confirmedFields.includes("locationDescription")),
        400,
        "LOCATION_UNCONFIRMED",
        "Confirm the incident location before selecting a handoff destination.",
      );
      requireCondition(
        r.history.length < 100,
        429,
        "HISTORY_LIMIT",
        "Review history limit reached.",
      );
      const incident = {
        ...r.incident,
        revision: r.incident.revision + 1,
        reviewDraft: draft,
        ...(r.incident.contextVersion !== undefined
          ? { reviewContextVersion: r.incident.contextVersion }
          : {}),
      };
      return {
        result: incident,
        put: {
          [key]: {
            ...r,
            incident,
            history: [
              ...r.history,
              {
                id: randomUUID(),
                action: "edit",
                at: new Date().toISOString(),
                reviewerUid: s.uid,
                revision: incident.revision,
                draft,
              },
            ],
          },
        },
      };
    });
  }
  async decide(session: Session, id: string, request: DecisionRequest) {
    const key = incidentKey(id),
      sk = sessionKey(session.uid),
      encoded = JSON.stringify(request);
    return this.db.transact([key, sk], (docs) => {
      const s = assertSession(docs[sk]),
        r = own(docs[key], s),
        prior = r.decisions[request.idempotencyKey];
      if (prior) {
        requireCondition(
          prior.request === encoded,
          409,
          "IDEMPOTENCY_CONFLICT",
          "This decision key was already used with different content.",
        );
        return { result: prior.incident };
      }
      this.editable(r.incident, request.expectedRevision);
      requireCondition(
        r.history.length < 100,
        429,
        "HISTORY_LIMIT",
        "Review history limit reached.",
      );
      if (request.action === "approve")
        requireCondition(
          r.incident.reviewDraft,
          409,
          "REVIEW_REQUIRED",
          "Save your review before approving.",
        );
      if (request.action === "approve")
        requireCondition(
          r.incident.contextVersion === undefined ||
            r.incident.reviewContextVersion === r.incident.contextVersion,
          409,
          "REVIEW_STALE",
          "New information arrived. Recheck and save your review before approving.",
        );
      const at = new Date().toISOString();
      const incident: Incident = {
        ...r.incident,
        revision: r.incident.revision + 1,
        reviewState:
          request.action === "approve"
            ? "approved"
            : request.action === "close"
              ? "closed"
              : "needs_clarification",
        ...(request.action === "approve"
          ? {
              simulationState: "completed" as const,
              dispatchReceipt: {
                id: randomUUID(),
                incidentId: id,
                approvedRevision: request.expectedRevision,
                createdAt: at,
                simulated: true as const,
              },
            }
          : {}),
      };
      return {
        result: incident,
        put: {
          [key]: {
            ...r,
            incident,
            decisions: {
              ...r.decisions,
              [request.idempotencyKey]: { request: encoded, incident },
            },
            history: [
              ...r.history,
              {
                id: randomUUID(),
                action: request.action,
                at,
                reviewerUid: s.uid,
                revision: request.expectedRevision,
                reason: request.reason,
              },
            ],
          },
        },
      };
    });
  }
  private editable(i: Incident, revision: number) {
    requireCondition(
      i.revision === revision,
      409,
      "REVISION_CONFLICT",
      "This report changed. Reload it before deciding.",
    );
    requireCondition(
      i.analysisState !== "processing",
      409,
      "ANALYSIS_ACTIVE",
      "Wait for analysis to finish.",
    );
    requireCondition(
      !["approved", "closed"].includes(i.reviewState),
      409,
      "REVIEW_FINISHED",
      "This review is already finished.",
    );
  }
}
