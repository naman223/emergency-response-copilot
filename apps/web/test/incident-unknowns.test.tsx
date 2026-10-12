import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { Incident } from "@copilot/contracts";
import { IncidentReport } from "../src/features/conversation/IncidentReport";
import { IncidentContext } from "../src/features/conversation/IncidentContext";
import { ReviewedIncident } from "../src/features/conversation/ReviewedIncident";

it("shows a deduplicated ledger in all three views of a previously saved incident without mutating its evidence", async () => {
  const captured = JSON.parse(
    await readFile(
      new URL(
        "../../../fixtures/regressions/duplicate-unknowns.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const incident: Incident = {
    id: "11111111-1111-4111-8111-111111111111",
    revision: 8,
    createdAt: "2026-10-06T00:00:00.000Z",
    expiresAt: "2026-10-07T00:00:00.000Z",
    analysisState: "ready",
    reviewState: "approved",
    simulationState: "not_started",
    analysisMode: "live",
    intakeState: "ready",
    assessment: captured.response.assessment,
    clarifications: [
      {
        turnId: "22222222-2222-4222-8222-222222222222",
        question: "Are other personnel safe?",
        answer: "Unknown",
        createdAt: "2026-10-06T00:01:00.000Z",
        assessmentState: "included",
      },
    ],
  };
  const before = JSON.stringify(incident);
  const report = renderToStaticMarkup(<IncidentReport incident={incident} />);
  expect(report).toContain("Remaining gaps (7)");
  expect(report.match(/<li>/g)).toHaveLength(7);
  const context = renderToStaticMarkup(
    <IncidentContext incident={incident} onReview={() => {}} />,
  );
  const reviewed = renderToStaticMarkup(
    <ReviewedIncident incident={incident} />,
  );
  for (const markup of [context, reviewed]) {
    const list = markup.match(
      /class="context-unknowns">[\s\S]*?<ul>([\s\S]*?)<\/ul>/,
    )?.[1];
    expect(list?.match(/<li>/g)).toHaveLength(7);
    expect(markup).toContain("Are other personnel safe?");
    expect(markup).toContain("<p>Unknown</p>");
  }
  expect(context.match(/<blockquote>“Unknown”<\/blockquote>/g)).toHaveLength(4);
  expect(JSON.stringify(incident)).toBe(before);
});
