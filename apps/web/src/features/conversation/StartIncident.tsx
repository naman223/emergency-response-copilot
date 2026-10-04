import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Play,
  Radio,
  MapPin,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import type { IntakeRequest, SourceLocation } from "@copilot/contracts";
import { AudioInput } from "../caller/AudioInput";
import type { Sample } from "../caller/CallerView";
import { ensureUser } from "../../firebase";
export function StartIncident({
  samples,
  busy,
  onStart,
}: {
  samples: Sample[];
  busy: boolean;
  onStart: (m: IntakeRequest, file?: File) => Promise<void>;
}) {
  const [text, setText] = useState(""),
    [file, setFile] = useState<File>(),
    [description, setDescription] = useState(""),
    [location, setLocation] = useState<SourceLocation>(),
    [notice, setNotice] = useState(""),
    [preview, setPreview] = useState<{ id: string; url: string }>();
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );
  async function play(id: string) {
    try {
      const user = await ensureUser();
      const r = await fetch(`/api/samples/${id}/audio`, {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      if (!r.ok) throw Error("Sample unavailable.");
      setPreview({ id, url: URL.createObjectURL(await r.blob()) });
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
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
        setNotice("Device location attached; verification is still required.");
      },
      () => setNotice("Location unavailable. You can continue without it."),
      { timeout: 10000 },
    );
  }
  const metadata = {
    ...(description ? { locationDescription: description } : {}),
    ...(location ? { sourceLocation: location } : {}),
  };
  return (
    <div className="start-incident">
      <div className="start-intro">
        <span className="caps">
          <Radio size={15} /> OFFICER WORKSPACE
        </span>
        <h1>
          Start with what you know.
          <br />
          <span>We’ll work through it together.</span>
        </h1>
        <p>
          Report an incident to your AI emergency coordinator. Share the facts,
          clarify the gaps, then make the human decision.
        </p>
      </div>
      <div className="start-columns">
        <section className="new-report-panel">
          <div className="section-label">
            <MessageSquare size={18} />
            <h2>Report an incident</h2>
          </div>
          <label className="field">
            What is happening?
            <textarea
              rows={4}
              maxLength={2000}
              placeholder="For example: A caller reports being followed near the north gate…"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setFile(undefined);
              }}
            />
          </label>
          <AudioInput
            onFile={(f) => {
              setFile(f);
              setText("");
            }}
          />
          {file && <p className="inline-message">Attached: {file.name}</p>}
          <label className="field">
            Location description <span className="optional">optional</span>
            <input
              placeholder="Site, entrance or nearby landmark"
              value={description}
              maxLength={500}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <button className="text-button" onClick={locate}>
            <MapPin size={15} />
            Use device location
          </button>
          {notice && (
            <p role="status" className="hint">
              {notice}
            </p>
          )}
          <button
            className="primary begin-report"
            disabled={busy || (!text.trim() && !file)}
            onClick={() =>
              onStart(
                {
                  ...metadata,
                  ...(text.trim() ? { reportText: text.trim() } : {}),
                },
                file,
              )
            }
          >
            {busy ? "Starting…" : "Start conversation"}
            <ArrowUpRight size={17} />
          </button>
          <p className="local-note">
            Local mode: personal reports are saved for manual review. Try a
            sample below for a guided coordinator conversation.
          </p>
        </section>
        <aside className="getting-started">
          <span className="coordinator-emblem">
            <Radio size={30} />
          </span>
          <h2>A coordinator beside you.</h2>
          <ol>
            <li>
              <strong>Share the report</strong>
              <span>Use a sample, type an observation or attach audio.</span>
            </li>
            <li>
              <strong>Talk through the gaps</strong>
              <span>
                Answer a follow-up, say “Unknown,” or correct a detail.
              </span>
            </li>
            <li>
              <strong>Review and decide</strong>
              <span>
                Check the incident brief before approving a simulation.
              </span>
            </li>
          </ol>
          <div className="privacy-note">
            <ShieldCheck size={19} />
            <span>
              Private to your demo session.
              <br />
              No emergency services are contacted.
            </span>
          </div>
        </aside>
      </div>
      <section className="scenario-section">
        <div className="scenario-heading">
          <div>
            <span className="caps">GUIDED DEMONSTRATIONS</span>
            <h2>Try a sample conversation</h2>
          </div>
          <span className="mode-pill">Scripted sample mode</span>
        </div>
        <div className="scenario-cards">
          {samples.map((s, i) => (
            <article className="scenario-card" key={s.id}>
              <span className="scenario-index">0{i + 1}</span>
              <h3>{s.title}</h3>
              <p>{s.label}</p>
              <div className="scenario-actions">
                <button
                  className="sample-preview"
                  aria-label={`Preview recording: ${s.title}`}
                  onClick={() => play(s.id)}
                >
                  <Play size={14} />
                  Preview recording
                </button>
                <button
                  className="sample-start"
                  disabled={busy}
                  aria-label={`Start sample conversation: ${s.title}`}
                  onClick={() => onStart({ ...metadata, sampleId: s.id })}
                >
                  Start conversation <ArrowUpRight size={16} />
                </button>
              </div>
              {preview?.id === s.id && (
                <audio
                  controls
                  autoPlay
                  aria-label={`Sample recording: ${s.title}`}
                  src={preview.url}
                />
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
