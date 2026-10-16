import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Incident } from "@copilot/contracts";
import { ConversationWorkspace } from "../src/features/conversation/ConversationWorkspace";
import { ReviewForm } from "../src/features/responder/ReviewForm";
const state = vi.hoisted(() => ({ chat: {} as any }));
vi.mock("../src/features/conversation/useConversation", () => ({
  useConversation: () => state.chat,
}));
vi.mock("../src/api", () => ({ apiRequest: vi.fn(), audioUrl: vi.fn() }));
const incident: Incident = {
  id: "11111111-1111-4111-8111-111111111111",
  revision: 1,
  createdAt: "2026-10-16T00:00:00.000Z",
  expiresAt: "2026-10-17T00:00:00.000Z",
  analysisState: "pending",
  reviewState: "pending",
  simulationState: "not_started",
  analysisMode: "live",
  reportText: "Fictional report of door damage at a demo warehouse.",
};
const assessment = {
  summary: "Door damage reported; area secured.",
  urgency: "standard_review" as const,
  routing: "police" as const,
  locationDescription: "Demo warehouse",
  facts: [],
  unknowns: [],
};
beforeEach(() => {
  vi.stubGlobal("window", {
    location: { origin: "https://copilot.example.test" },
  });
  state.chat = {
    snapshot: { incident, turns: [] },
    busy: false,
    partial: "",
    stage: "",
    error: "",
    setError() {},
    refresh() {},
    send() {},
    start() {},
    finish() {},
    retry() {},
  };
});
afterEach(() => vi.unstubAllGlobals());
function workspace(value: Incident, busy = false) {
  state.chat.snapshot.incident = value;
  state.chat.busy = busy;
  return renderToStaticMarkup(
    <ConversationWorkspace
      id={value.id}
      initial={false}
      mode="live"
      onUpdate={() => {}}
    />,
  );
}
it("shows initial assessment processing without a question quota", () => {
  const html = workspace(incident, true);
  expect(html).toContain("Assessing your report…");
  expect(html).not.toContain("0/10");
  expect(html).not.toContain("Essential clarification");
});
it("shows a saved report awaiting assessment without claiming processing has started", () => {
  const html = workspace(incident);
  expect(html).toContain("Report received");
  expect(html).not.toContain("Assessing your report…");
});
it("shows the current clarification question without implying ten required answers", () => {
  state.chat.snapshot.turns = [
    {
      id: "22222222-2222-4222-8222-222222222222",
      incidentId: incident.id,
      kind: "initial",
      state: "completed",
      attempts: 1,
      officerText: incident.reportText,
      reply: "Please confirm the location.",
      question: "What is the exact warehouse address?",
      createdAt: incident.createdAt,
      updatedAt: incident.createdAt,
    },
  ];
  const html = workspace({
    ...incident,
    analysisState: "ready",
    assessment,
    intakeState: "clarifying",
    clarificationCount: 1,
  });
  expect(html).toContain("Clarifying key details");
  expect(html).toContain("Question 1");
  expect(html).toContain("What is the exact warehouse address?");
  expect(html).not.toContain("1/10");
});
it("shows readiness only after assessment and intake completion", () => {
  const html = workspace({
    ...incident,
    analysisState: "ready",
    assessment,
    intakeState: "ready",
  });
  expect(html).toContain("Ready for human review");
  expect(html).toContain("Review handoff");
});
it("shows an update in progress rather than prematurely claiming readiness", () => {
  const html = workspace(
    { ...incident, analysisState: "ready", assessment, intakeState: "ready" },
    true,
  );
  expect(html).toContain("Updating assessment…");
  expect(html).not.toContain("Ready for human review");
});
it("does not call a failed initial assessment active processing", () => {
  const html = workspace({ ...incident, analysisState: "failed" });
  expect(html).toContain("Assessment not completed");
  expect(html).not.toContain("Assessing your report…");
});
it("shows pending recommendations instead of default unclear and zero services while loading", () => {
  const html = renderToStaticMarkup(
    <ReviewForm
      incident={incident}
      busy={true}
      onSave={async () => {}}
      onDecide={async () => {}}
    />,
  );
  expect(html).toContain("Assessment pending");
  expect(html).toContain("Recommendations pending");
  expect(html).not.toContain("No services selected");
  expect(html).not.toContain("0 services selected");
  expect(html).not.toContain(">Unclear</option>");
});
it("preserves a saved manual review before AI assessment is available", () => {
  const html = renderToStaticMarkup(
    <ReviewForm
      incident={{
        ...incident,
        reviewDraft: {
          summary: "Manually checked door damage.",
          urgency: "standard_review",
          routing: "police",
          services: ["police"],
          locationDescription: "Demo warehouse",
          confirmedFields: [],
          editedFields: ["summary", "urgency", "services"],
        },
      }}
      busy={false}
      onSave={async () => {}}
      onDecide={async () => {}}
    />,
  );
  expect(html).toContain("Standard review");
  expect(html).toContain("Manually checked door damage.");
  expect(html).not.toContain("Recommendations pending");
});
