import { it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { buildApp } from "../src/app";
import { createConfig } from "../src/config";
import { memory } from "./helpers";
import { startSession, sessionKey } from "../src/auth/session";
import { IncidentService } from "../src/incidents/service";
import { FixtureProvider } from "../src/analysis/fixture";

async function setup(
  output: unknown = {
    transcript: "I heard shouting near the north gate.",
    locationDescription: "the north gate",
  },
  timeout = 1000,
) {
  const m = memory();
  const session = await startSession(m.db, "alice");
  const deps = {
    ...m,
    config: { ...createConfig({}), analysisTimeout: timeout },
    provider: new FixtureProvider(),
    previewProvider: { preview: async () => output },
    verifyToken: async (token: string) => token,
  };
  const app = await buildApp(deps);
  return { ...m, app, session, deps };
}
const headers = { authorization: "Bearer alice" };

it("accepts multibyte reviewed transcripts with their original recording", async () => {
  const s = await setup();
  try {
    const { wav } = await audioBody();
    const reportText = "न".repeat(1500);
    const payload = Buffer.concat([
      Buffer.from(
        '--upload\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n' +
          JSON.stringify({ reportText }) +
          '\r\n--upload\r\nContent-Disposition: form-data; name="audio"; filename="recording.wav"\r\nContent-Type: audio/wav\r\n\r\n',
      ),
      wav,
      Buffer.from("\r\n--upload--\r\n"),
    ]);
    const response = await s.app.inject({
      method: "POST",
      url: "/api/incidents",
      headers: {
        ...headers,
        "content-type": "multipart/form-data; boundary=upload",
      },
      payload,
    });
    expect(response.statusCode).toBe(201);
    expect(
      (await new IncidentService(s.deps).record(s.session, response.json().id))
        .reportText,
    ).toBe(reportText);
  } finally {
    await s.app.close();
  }
});
async function audioBody() {
  const wav = await readFile("fixtures/audio/ambiguous.wav");
  return {
    wav,
    payload: Buffer.concat([
      Buffer.from(
        '--preview\r\nContent-Disposition: form-data; name="audio"; filename="recording.wav"\r\nContent-Type: audio/wav\r\n\r\n',
      ),
      wav,
      Buffer.from("\r\n--preview--\r\n"),
    ]),
  };
}

it("previews audio without creating an incident or retaining uploaded audio", async () => {
  const s = await setup();
  try {
    const { payload } = await audioBody();
    const result = await s.app.inject({
      method: "POST",
      url: "/api/report-preview",
      headers: {
        ...headers,
        "content-type": "multipart/form-data; boundary=preview",
      },
      payload,
    });
    expect(result.statusCode).toBe(200);
    expect(result.json()).toEqual({
      transcript: "I heard shouting near the north gate.",
      locationDescription: "the north gate",
    });
    expect(await s.db.list("incident:")).toHaveLength(0);
    expect(s.blobs.size).toBe(0);
    expect(s.docs[sessionKey("alice")].quota.count).toBe(1);
    expect(s.docs[sessionKey("alice")].activeLease).toBeUndefined();
  } finally {
    await s.app.close();
  }
});

it("requires a session and shares inference quotas with conversation", async () => {
  const s = await setup();
  try {
    const request = {
      method: "POST" as const,
      url: "/api/report-preview",
      payload: { text: "I heard shouting near the north gate." },
    };
    expect((await s.app.inject(request)).statusCode).toBe(401);
    s.docs[sessionKey("alice")].quota = {
      hour: Math.floor(Date.now() / 3600000),
      count: 30,
    };
    expect((await s.app.inject({ ...request, headers })).statusCode).toBe(429);
  } finally {
    await s.app.close();
  }
});

it("does not accept invented locations or rewritten typed reports", async () => {
  for (const output of [
    { transcript: "I heard shouting.", locationDescription: "New Delhi" },
    { transcript: "Someone is injured.", locationDescription: null },
  ]) {
    const s = await setup(output);
    try {
      const r = await s.app.inject({
        method: "POST",
        url: "/api/report-preview",
        headers,
        payload: { text: "I heard shouting." },
      });
      expect(r.statusCode).toBe(502);
      expect(s.docs[sessionKey("alice")].activeLease).toBeUndefined();
    } finally {
      await s.app.close();
    }
  }
});

it("retains corrected report text alongside the original audio on explicit submission", async () => {
  const s = await setup();
  try {
    const { wav } = await audioBody();
    const intake = new IncidentService(s.deps);
    const incident = await intake.create(
      s.session,
      {
        reportText: "Corrected report: shouting near the south gate.",
        locationDescription: "south gate",
      },
      wav,
    );
    const record = await intake.record(s.session, incident.id);
    expect(record.reportText).toBe(
      "Corrected report: shouting near the south gate.",
    );
    expect((await intake.audio(s.session, incident.id)).length).toBeGreaterThan(
      44,
    );
    await expect(
      intake.create(s.session, {
        sampleId: "ambiguous",
        reportText: "Mixed sources",
      }),
    ).rejects.toMatchObject({ status: 400 });
  } finally {
    await s.app.close();
  }
});

it("times out a stuck provider, releases the lease and lets a later preview proceed", async () => {
  const s = await setup(new Promise(() => {}), 25);
  try {
    const request = {
      method: "POST" as const,
      url: "/api/report-preview",
      headers,
      payload: { text: "Noise outside." },
    };
    const result = await s.app.inject(request);
    expect(result.statusCode).toBe(504);
    expect(s.docs[sessionKey("alice")].activeLease).toBeUndefined();
    s.deps.previewProvider.preview = async () => ({
      transcript: "Noise outside.",
      locationDescription: null,
    });
    expect((await s.app.inject(request)).json()).toEqual({
      transcript: "Noise outside.",
      locationDescription: null,
    });
  } finally {
    await s.app.close();
  }
});

it("rejects invalid audio before model inference and treats silence as an empty draft", async () => {
  const s = await setup({ transcript: "", locationDescription: null });
  try {
    const { payload } = await audioBody();
    const result = await s.app.inject({
      method: "POST",
      url: "/api/report-preview",
      headers: {
        ...headers,
        "content-type": "multipart/form-data; boundary=preview",
      },
      payload,
    });
    expect(result.json()).toEqual({
      transcript: "",
      locationDescription: null,
    });
    const invalid = Buffer.from(
      '--preview\r\nContent-Disposition: form-data; name="audio"; filename="bad.wav"\r\nContent-Type: audio/wav\r\n\r\nnot audio\r\n--preview--\r\n',
    );
    expect(
      (
        await s.app.inject({
          method: "POST",
          url: "/api/report-preview",
          headers: {
            ...headers,
            "content-type": "multipart/form-data; boundary=preview",
          },
          payload: invalid,
        })
      ).statusCode,
    ).toBe(400);
  } finally {
    await s.app.close();
  }
});
