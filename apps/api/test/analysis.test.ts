import { it, expect } from "vitest";
import { memory } from "./helpers";
import { createConfig } from "../src/config";
import { startSession } from "../src/auth/session";
import { IncidentService } from "../src/incidents/service";
import { AnalysisService } from "../src/analysis/service";
async function setup(provider: any, timeout = 30) {
  const m = memory(),
    config = {
      ...createConfig({}),
      mode: "live" as const,
      analysisTimeout: timeout,
    };
  const session = await startSession(m.db, "alice");
  const intake = new IncidentService({ ...m, config });
  const i = await intake.create(session, { sampleId: "explicit-threat" });
  const analysis = new AnalysisService({ ...m, config, provider });
  return { ...m, config, session, i, intake, analysis };
}
it("preserves original audio on provider failure, allows three attempts, and never inserts a fixture success", async () => {
  const s = await setup({
    async analyze() {
      throw new Error("secret provider data");
    },
  });
  for (let n = 0; n < 3; n++) {
    const r = await s.analysis.run(s.session, s.i.id);
    expect(r.analysisState).toBe("failed");
    expect(r.analysisMode).toBe("live");
    expect(r.brief).toBeUndefined();
  }
  await expect(s.analysis.run(s.session, s.i.id)).rejects.toMatchObject({
    status: 429,
  });
  expect(s.blobs.size).toBe(1);
});
it("bounds an uncooperative provider and releases the active lease", async () => {
  const s = await setup({ analyze: () => new Promise(() => {}) }, 15);
  const r = await s.analysis.run(s.session, s.i.id);
  expect(r.failureCode).toBe("ANALYSIS_TIMEOUT");
  expect(s.docs["session:alice"].activeLease).toBeUndefined();
});
it("rejects concurrent analyses for the same session", async () => {
  let finish!: () => void;
  const s = await setup(
    {
      async analyze() {
        await new Promise<void>((r) => (finish = r));
        throw Error("failure");
      },
    },
    1000,
  );
  const first = s.analysis.run(s.session, s.i.id);
  while (!finish) await new Promise((r) => setTimeout(r, 1));
  await expect(s.analysis.run(s.session, s.i.id)).rejects.toMatchObject({
    status: 409,
  });
  finish();
  await first;
});
it("does not accept hallucinated coordinates from model output", async () => {
  const s = await setup({
    async analyze() {
      return {
        transcript: "hi",
        facts: [],
        unknowns: [],
        urgency: "unclear",
        routing: "unclear",
        explanation: "",
        latitude: 12,
      };
    },
  });
  const r = await s.analysis.run(s.session, s.i.id);
  expect(r.analysisState).toBe("failed");
  expect(r.sourceLocation).toBeUndefined();
});
it("marks quota responses retryable without invoking inference", async () => {
  const s = await setup({
    async analyze() {
      throw Error("must not execute");
    },
  });
  s.docs["quota:global"] = {
    hour: Math.floor(Date.now() / 3600000),
    count: 100,
  };
  await expect(s.analysis.run(s.session, s.i.id)).rejects.toMatchObject({
    status: 429,
    retryable: true,
  });
  expect(s.docs[`incident:${s.i.id}`].attempts).toBe(0);
});
it("an old worker cannot overwrite a replacement lease", async () => {
  let finish!: () => void;
  const s = await setup(
    {
      async analyze() {
        await new Promise<void>((r) => (finish = r));
        throw Error("failure");
      },
    },
    1000,
  );
  const first = s.analysis.run(s.session, s.i.id);
  while (!finish) await new Promise((r) => setTimeout(r, 1));
  s.docs[`incident:${s.i.id}`].lease = {
    token: "replacement",
    until: Date.now() + 1000,
  };
  s.docs["session:alice"].activeLease = {
    token: "replacement",
    until: Date.now() + 1000,
  };
  finish();
  await expect(first).rejects.toMatchObject({ status: 409 });
  expect(s.docs[`incident:${s.i.id}`].incident.analysisState).toBe(
    "processing",
  );
});
it("recovers interrupted final attempts on read and permits manual review without clearing another lease", async () => {
  const s = await setup({
    async analyze() {
      throw Error("not called");
    },
  });
  const key = `incident:${s.i.id}`;
  s.docs[key].incident.analysisState = "processing";
  s.docs[key].attempts = 3;
  s.docs[key].lease = { token: "old", until: Date.now() - 1000 };
  s.docs["session:alice"].activeLease = {
    token: "newer",
    until: Date.now() + 10000,
  };
  const recovered = await s.intake.get(s.session, s.i.id);
  expect(recovered.analysisState).toBe("failed");
  expect(recovered.failureCode).toBe("ANALYSIS_INTERRUPTED");
  expect(recovered.revision).toBe(2);
  expect(s.docs["session:alice"].activeLease.token).toBe("newer");
  const { ReviewService } = await import("../src/review/service");
  const edited = await new ReviewService(s.db).save(
    s.session,
    s.i.id,
    recovered.revision,
    {
      summary: "Manually checked original audio",
      urgency: "unclear",
      routing: "unclear",
      locationDescription: "Unknown",
      confirmedFields: [],
    },
  );
  expect(edited.reviewDraft?.summary).toBe("Manually checked original audio");
});
