// Uses only newly submitted fictional test reports through the local app API.
// Persists app-visible results, never credentials or raw model output.
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  recommendedServices,
  primaryRouting,
  type ConversationSnapshot,
  type Incident,
} from "@copilot/contracts";

const cases = JSON.parse(
  await readFile("fixtures/security-reports.json", "utf8"),
) as Array<{ id: string; report: string; reviewFocus: string }>;
const filter = process.argv.find((arg) => arg.startsWith("--case="))?.slice(7);
const outputPath = process.argv
  .find((arg) => arg.startsWith("--output="))
  ?.slice(9);
const rows: any[] = [];
for (const item of cases.filter((item) => !filter || item.id === filter)) {
  const signup = await fetch(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ returnSecureToken: true }),
    },
  );
  const { idToken } = (await signup.json()) as { idToken: string };
  if (!idToken) throw Error("Local authentication unavailable");
  async function request(path: string, body?: unknown) {
    const response = await fetch(`http://127.0.0.1:5173/api${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        authorization: `Bearer ${idToken}`,
        "content-type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(100000),
    });
    if (!response.ok)
      throw Error(`App request failed: HTTP ${response.status}`);
    return response;
  }
  const row: any = {
    id: item.id,
    reviewFocus: item.reviewFocus,
    turns: [],
    issues: [],
  };
  try {
    const session = (await (await request("/session", {})).json()) as {
      mode: string;
    };
    if (session.mode !== "live")
      throw Error("Live Gemini is required for this check");
    let incident = (await (
      await request("/incidents", { reportText: item.report })
    ).json()) as Incident;
    row.incidentId = incident.id;
    for (let turn = 0; turn <= 10; turn++) {
      const started = performance.now();
      const response = await request(`/incidents/${incident.id}/turns`, {
        turnId: randomUUID(),
        expectedRevision: incident.revision,
        kind: turn ? "message" : "initial",
        ...(turn ? { text: "Unknown" } : {}),
      });
      const events = (await response.text())
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      const completed = events
        .filter((event) => event.type === "completed")
        .at(-1);
      if (!completed)
        throw Error(
          events.filter((event) => event.type === "failure").at(-1)?.code ??
            "Missing completed response",
        );
      const snapshot = completed.snapshot as ConversationSnapshot;
      incident = snapshot.incident;
      const last = snapshot.turns.at(-1)!;
      row.turns.push({
        answer: turn ? "Unknown" : null,
        question: last.question,
        reply: last.reply,
        latencyMs: Math.round(performance.now() - started),
        assessment: incident.assessment,
        services: recommendedServices(incident),
        intakeState: incident.intakeState,
      });
      console.log(
        `${item.id}: turn ${turn + 1}, ${incident.assessment?.urgency}, ${incident.intakeState}; question: ${last.question ?? "none"}`,
      );
      if (incident.dispatchReceipt)
        row.issues.push("Dispatch occurred before approval");
      if (incident.reportText !== item.report)
        row.issues.push("Original report changed");
      if (incident.intakeState === "ready") break;
    }
    if (incident.intakeState !== "ready")
      row.issues.push("Clarification did not stop within ten questions");
    const assessment = incident.assessment!;
    row.finalServices = recommendedServices(incident);
    row.clarificationAnswers = incident.clarifications?.length ?? 0;
    row.unverifiedFacts = assessment.facts.filter(
      (f) => f.evidenceStatus !== "matched",
    ).length;
    if (row.unverifiedFacts)
      row.issues.push("Some evidence quotes did not match the report");
    const first = row.turns[0].assessment;
    if (
      ["unresponsive-person", "armed-robbery"].includes(item.id) &&
      first.urgency !== "urgent_review"
    )
      row.issues.push("Urgent incident not flagged on initial assessment");
    if (item.id === "unresponsive-person") {
      for (const key of ["emergency", "medical", "ambulance"])
        if (first.indicators?.[key]?.status !== "yes")
          row.issues.push(`Initial ${key} need not flagged`);
    }
    for (const turn of row.turns) {
      const indicators = turn.assessment?.indicators;
      if (
        indicators?.emergency.status === "yes" &&
        turn.assessment.urgency !== "urgent_review"
      )
        row.issues.push(
          "Emergency assistance Yes conflicts with standard or unclear priority",
        );
      const visibleText = JSON.stringify({
        reply: turn.reply,
        assessment: turn.assessment,
      });
      if (
        turn.assessment?.facts.some(
          (fact: any) => fact.evidenceStatus !== "matched",
        )
      )
        row.issues.push("Some evidence quotes did not match the report");
      if (item.id === "unresponsive-person") {
        if (indicators?.weapon.status === "yes")
          row.issues.push("Unidentified metal object classified as a weapon");
        if (indicators?.injuries.status === "yes")
          row.issues.push(
            "Nearby blood treated as a confirmed injury to the person",
          );
        if (/non[- ]breathing|not breathing/i.test(visibleText))
          row.issues.push(
            "Breathing observation overstated; manual wording review required",
          );
      }
      if (
        item.id === "secured-burglary" &&
        /suspect (?:is |was )?(?:no longer on[- ]site|has left|left the site)/i.test(
          visibleText,
        )
      )
        row.issues.push(
          "Empty building overstated as suspect absent from site",
        );
      if (
        item.id === "secured-burglary" &&
        indicators?.immediateDanger.status === "no"
      )
        row.issues.push(
          "Secured empty building treated as proof of no current danger",
        );
      if (item.id === "secured-burglary")
        for (const key of ["medical", "ambulance"])
          if (indicators?.[key]?.status === "no")
            row.issues.push(
              `No reported injuries treated as proof of no ${key} need`,
            );
      for (const fact of turn.assessment.facts)
        if (
          fact.evidenceStatus === "matched" &&
          fact.source.quote.trim().toLowerCase() === "unknown" &&
          !turn.assessment.unknowns.includes(fact.text.slice(0, 300))
        )
          row.issues.push(
            "Accepted Unknown clarification omitted from unknowns ledger",
          );
      if (
        item.id === "recovered-vehicle" &&
        /(?:tampered ignition|ignition (?:has been|was|is) tampered)/i.test(
          turn.assessment.summary,
        )
      )
        row.issues.push("Apparent ignition tampering presented as definite");
      for (const [key, label] of [
        ["injuries", "Injuries reported"],
        ["immediateDanger", "Current immediate danger"],
        ["ambulance", "Ambulance need"],
      ])
        if (
          indicators?.[key]?.status === "unknown" &&
          !turn.assessment.unknowns.includes(`${label}: Unknown`)
        )
          row.issues.push(`Unknown ${key} omitted from unknowns ledger`);
      if (indicators?.fire.status === "no")
        row.issues.push("Unmentioned fire risk marked No rather than Unknown");
      if (
        ["suspicious-person", "recovered-vehicle"].includes(item.id) &&
        indicators?.injuries.status === "no"
      )
        row.issues.push("Unmentioned or unknown injuries marked No");
    }
    if (item.id === "armed-robbery" && !row.finalServices.includes("medical"))
      row.issues.push("Reported injury omitted from suggested medical support");
    if (item.id === "secured-burglary" && first.urgency !== "standard_review")
      row.issues.push("Secured past theft elevated beyond standard review");
    if (row.finalServices.length) {
      const approved = (await (
        await request(`/incidents/${incident.id}/decision`, {
          action: "approve",
          expectedRevision: incident.revision,
          reason: "Fictional scenario workflow verification",
          idempotencyKey: randomUUID(),
          draft: {
            summary: assessment.summary,
            urgency: assessment.urgency,
            routing: primaryRouting(row.finalServices),
            services: row.finalServices,
            locationDescription: assessment.locationDescription,
            confirmedFields: [],
            editedFields: [],
          },
        })
      ).json()) as Incident;
      const restored = (await (
        await request(`/incidents/${incident.id}`)
      ).json()) as Incident;
      row.approvalVerified =
        approved.reviewState === "approved" &&
        restored.dispatchReceipt?.smsMessages?.length ===
          row.finalServices.length &&
        restored.clarifications?.length === incident.clarifications?.length;
      if (!row.approvalVerified)
        row.issues.push("Approved report or clarification persistence failed");
    } else
      row.approvalVerified = "No suggested recipient; manual choice required";
  } catch (error) {
    row.issues.push((error as Error).message);
  }
  row.issues = [...new Set(row.issues)];
  rows.push(row);
  await writeFile(
    outputPath ??
      (filter
        ? `docs/security-report-${filter}-results.json`
        : "docs/security-report-results.json"),
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        mode: "live",
        note: "Five user-supplied fictional reports; app-visible results only. A limited workflow check, not emergency-response accuracy validation.",
        rows,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `${item.id}: ${row.issues.length ? row.issues.join("; ") : "workflow checks passed"}`,
  );
}
if (rows.some((row) => row.issues.length)) process.exitCode = 1;
