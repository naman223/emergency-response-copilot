import { useState } from "react";
import {
  ArrowRight,
  Check,
  MapPin,
  Play,
  Radio,
  ShieldCheck,
} from "lucide-react";
import type { SourceLocation, IntakeRequest } from "@copilot/contracts";
import { AudioInput } from "./AudioInput";
export type Sample = {
  id: string;
  title: string;
  label: string;
  description: string;
};
export function CallerView({
  samples,
  mode,
  busy,
  onSubmit,
}: {
  samples: Sample[];
  mode: string;
  busy: boolean;
  onSubmit: (metadata: IntakeRequest, file?: File) => Promise<void>;
}) {
  const [selected, setSelected] = useState(""),
    [file, setFile] = useState<File>(),
    [location, setLocation] = useState<SourceLocation>(),
    [description, setDescription] = useState(""),
    [notice, setNotice] = useState("");
  function locate() {
    if (!navigator.geolocation) {
      setNotice("Location unavailable. Enter a description instead.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocation({
          source: "device",
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          accuracyMeters: p.coords.accuracy,
          capturedAt: new Date(p.timestamp).toISOString(),
        });
        setNotice(
          "Device location attached. A responder still needs to verify it.",
        );
      },
      () =>
        setNotice(
          "Location unavailable. You can continue without it or enter a description.",
        ),
      { timeout: 10000 },
    );
  }
  return (
    <>
      <div className="page-intro">
        <div>
          <span className="eyebrow">CALLER INTAKE</span>
          <h1>
            A voice report.
            <br />
            <span>A clearer first response.</span>
          </h1>
          <p>
            Capture what happened. Give a human responder
            <br className="desktop-break" /> the context to make an informed
            decision.
          </p>
        </div>
        <div className="intro-symbol">
          <Radio size={54} />
          <span>VOICE → CONTEXT</span>
        </div>
      </div>
      <div className="caller-grid">
        <section className="card intake-card">
          <div className="section-title">
            <span className="step">01</span>
            <div>
              <h2>Start with a recording</h2>
              <p>Choose a fictional scenario or bring your own audio.</p>
            </div>
          </div>
          <AudioInput
            onFile={(f) => {
              setFile(f);
              setSelected("");
            }}
          />
          <div className="divider-label">
            <span>OR TRY A SAMPLE</span>
          </div>
          <div className="sample-grid">
            {samples.map((s, index) => (
              <button
                key={s.id}
                className={`sample ${selected === s.id ? "selected" : ""}`}
                onClick={() => {
                  setSelected(s.id);
                  setFile(undefined);
                }}
              >
                <span className="sample-top">
                  <span className="scenario-number">0{index + 1}</span>
                  {selected === s.id ? <Check size={17} /> : <Play size={14} />}
                </span>
                <strong>{s.title}</strong>
                <span>{s.label}</span>
              </button>
            ))}
          </div>
          {file && <p className="inline-message">Selected: {file.name}</p>}
          <div className="section-title location-title">
            <span className="step">02</span>
            <div>
              <h2>Add location context</h2>
              <p>Optional. Unknown location stays unknown.</p>
            </div>
          </div>
          <label className="field">
            Location description
            <input
              value={description}
              maxLength={500}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="For example, near the library’s north entrance"
            />
          </label>
          <button className="text-button" onClick={locate}>
            <MapPin size={16} />
            Use device location
          </button>
          {notice && (
            <p className="hint" role="status">
              {notice}
            </p>
          )}
          <div className="submit-row">
            <span>
              {selected
                ? "Fictional sample selected"
                : file
                  ? "Your recording selected"
                  : "Choose a recording to continue"}
            </span>
            <button
              className="primary"
              disabled={busy || (!selected && !file)}
              onClick={() =>
                onSubmit(
                  {
                    ...(selected ? { sampleId: selected } : {}),
                    ...(location ? { sourceLocation: location } : {}),
                    ...(description
                      ? { locationDescription: description }
                      : {}),
                  },
                  file,
                )
              }
            >
              {busy ? "Processing…" : "Submit report"}
              <ArrowRight size={17} />
            </button>
          </div>
        </section>
        <aside className="caller-aside">
          <section className="card flow-card">
            <span className="eyebrow">HOW IT WORKS</span>
            <h2>
              Built around
              <br />
              human judgment.
            </h2>
            <ol>
              <li>
                <span>1</span>
                <div>
                  <strong>Capture the report</strong>
                  <p>Audio and optional location, submitted together.</p>
                </div>
              </li>
              <li>
                <span>2</span>
                <div>
                  <strong>Organize the evidence</strong>
                  <p>
                    Reported facts, supporting quotes, and unanswered questions.
                  </p>
                </div>
              </li>
              <li>
                <span>3</span>
                <div>
                  <strong>Review, then decide</strong>
                  <p>A human checks the brief before any simulated action.</p>
                </div>
              </li>
            </ol>
          </section>
          <section className="trust-note">
            <ShieldCheck size={23} />
            <h3>Your own demo workspace</h3>
            <p>
              Reports are private to this session. Reset at any time. Session
              access expires after 24 hours.
            </p>
          </section>
          <p className="aside-note">
            {mode === "fixture"
              ? "Local fixture mode uses prepared results for the five samples. Personal recordings can be reviewed manually; live AI analysis requires cloud setup."
              : "Live mode sends audio to Gemini for analysis. All suggestions require human verification."}
          </p>
        </aside>
      </div>
    </>
  );
}
