import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  Headphones,
  Mic,
  Radio,
  RotateCcw,
  ShieldCheck,
  X,
  BookOpen,
} from "lucide-react";
import type {
  Incident,
  IntakeRequest,
  ReviewDraft,
  DecisionRequest,
} from "@copilot/contracts";
import { auth, clearUser } from "./firebase";
import { apiRequest } from "./api";
import { CallerView, type Sample } from "./features/caller/CallerView";
import { ResponderView } from "./features/responder/ResponderView";
export default function App() {
  const [ready, setReady] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [mode, setMode] = useState("fixture"),
    [view, setView] = useState<"caller" | "responder">("caller"),
    [samples, setSamples] = useState<Sample[]>([]),
    [incidents, setIncidents] = useState<Incident[]>([]),
    [selectedId, setSelectedId] = useState(""),
    [guide, setGuide] = useState(false);
  const decisionKey = useRef<string>("");
  const selected = incidents.find((i) => i.id === selectedId);
  function select(id: string) {
    setSelectedId(id);
    sessionStorage.setItem("copilot-incident", id);
  }
  function update(i: Incident) {
    setIncidents((rows) =>
      [i, ...rows.filter((r) => r.id !== i.id)].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      ),
    );
  }
  async function start() {
    setBusy(true);
    setError("");
    try {
      const session = await apiRequest<{ mode: string }>("/session", {
        method: "POST",
      });
      const rows = await apiRequest<Incident[]>("/incidents");
      setMode(session.mode);
      setIncidents(rows);
      const saved = sessionStorage.getItem("copilot-incident");
      if (saved && rows.some((i) => i.id === saved)) {
        select(saved);
        setView("responder");
      }
      setReady(true);
    } catch (e) {
      setError((e as Error).message);
      await clearUser();
    } finally {
      setBusy(false);
      setLoading(false);
    }
  }
  useEffect(() => {
    let alive = true;
    fetch("/api/samples")
      .then((r) => r.json())
      .then((v) => {
        if (alive) {
          setSamples(v.samples);
          setMode(v.mode);
        }
      })
      .catch(() => {
        if (alive)
          setError(
            "The local API is unavailable. Check the terminal and retry.",
          );
      });
    auth.authStateReady().then(() => {
      if (!alive) return;
      if (auth.currentUser) void start();
      else setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (selected?.analysisState !== "processing") return;
    let active = true,
      attempts = 0;
    const timer = setInterval(() => {
      if (++attempts > 30) {
        clearInterval(timer);
        return;
      }
      apiRequest<Incident>(`/incidents/${selected.id}`)
        .then((i) => {
          if (active) update(i);
        })
        .catch(() => {});
    }, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [selectedId, selected?.analysisState]);
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function analyze(i: Incident) {
    update({ ...i, analysisState: "processing" });
    try {
      update(
        await apiRequest<Incident>(`/incidents/${i.id}/analyze`, {
          method: "POST",
        }),
      );
    } catch (e) {
      update(await apiRequest<Incident>(`/incidents/${i.id}`));
      throw e;
    }
  }
  async function submit(metadata: IntakeRequest, file?: File) {
    await act(async () => {
      let body: BodyInit;
      if (file) {
        const data = new FormData();
        data.append("metadata", JSON.stringify(metadata));
        data.append("audio", file);
        body = data;
      } else body = JSON.stringify(metadata);
      const i = await apiRequest<Incident>("/incidents", {
        method: "POST",
        body,
      });
      update(i);
      select(i.id);
      setView("responder");
      await analyze(i);
    });
  }
  async function save(draft: ReviewDraft) {
    if (!selected) return;
    await act(async () => {
      update(
        await apiRequest<Incident>(`/incidents/${selected.id}/review`, {
          method: "PATCH",
          body: JSON.stringify({ expectedRevision: selected.revision, draft }),
        }),
      );
      decisionKey.current = "";
    });
  }
  async function decide(action: DecisionRequest["action"], reason: string) {
    if (!selected) return;
    await act(async () => {
      decisionKey.current ||= crypto.randomUUID();
      update(
        await apiRequest<Incident>(`/incidents/${selected.id}/decision`, {
          method: "POST",
          body: JSON.stringify({
            expectedRevision: selected.revision,
            action,
            reason,
            idempotencyKey: decisionKey.current,
          }),
        }),
      );
      decisionKey.current = "";
    });
  }
  async function reset() {
    await act(async () => {
      await apiRequest("/session", { method: "DELETE" });
      await clearUser();
      sessionStorage.removeItem("copilot-incident");
      setReady(false);
      setIncidents([]);
      setSelectedId("");
      setView("caller");
    });
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Response Copilot home">
          <span className="brand-icon">
            <Activity size={23} />
          </span>
          <span>
            response<span className="brand-sub">COPILOT</span>
          </span>
        </a>
        <div className="workspace-label">DEMO WORKSPACE</div>
        <nav aria-label="Workspace">
          <button
            className={view === "caller" ? "nav-item active" : "nav-item"}
            onClick={() => setView("caller")}
          >
            <Mic size={18} />
            Caller intake
          </button>
          <button
            className={view === "responder" ? "nav-item active" : "nav-item"}
            onClick={() => setView("responder")}
          >
            <Headphones size={18} />
            Responder desk
            {incidents.length > 0 && (
              <span className="nav-count">{incidents.length}</span>
            )}
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="human-mark">
            <ShieldCheck size={20} />
            <div>
              Human judgment.
              <br />
              <span>At every critical step.</span>
            </div>
          </div>
          <button className="nav-item" onClick={() => setGuide(!guide)}>
            <BookOpen size={17} />
            Demo guide
          </button>
          {ready && (
            <button className="nav-item" disabled={busy} onClick={reset}>
              <RotateCcw size={17} />
              Reset session
            </button>
          )}
          <span className="sidebar-foot">
            Emergency intake prototype · v0.1
          </span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span>{" "}
            <strong>
              {view === "caller" ? "Caller intake" : "Responder desk"}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="mode-badge">
              <span className="status-dot" />
              {mode === "fixture" ? "Fixture analysis" : "Live Gemini analysis"}
            </span>
            <span className="avatar">DR</span>
            {ready && (
              <button
                className="mobile-reset"
                aria-label="Reset session"
                title="Reset session"
                disabled={busy}
                onClick={reset}
              >
                <RotateCcw size={16} />
              </button>
            )}
          </div>
        </header>
        <div className="simulation-banner">
          <ShieldCheck size={15} />
          <strong>SIMULATION ONLY</strong>
          <span>This prototype does not contact emergency services.</span>
        </div>
        <main>
          {error && (
            <div role="alert" className="error-banner">
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={17} />
              </button>
            </div>
          )}
          {guide && (
            <section className="card guide">
              <h2>Try the complete workflow</h2>
              <ol>
                <li>
                  Start a demo session and choose a fictional audio sample.
                </li>
                <li>
                  Submit it, replay the recording, and inspect the reported
                  facts.
                </li>
                <li>
                  Edit and save the human review, then enter a decision reason.
                </li>
                <li>
                  Approve the simulation or close with a reason. No real
                  dispatch occurs.
                </li>
              </ol>
              <p>
                Local fixture results are prepared examples, not live AI
                inference. All reports belong to your session.
              </p>
              <button className="text-button" onClick={() => setGuide(false)}>
                Close guide
              </button>
            </section>
          )}
          {!ready ? (
            <section className="welcome">
              <span className="eyebrow">EMERGENCY RESPONSE COPILOT</span>
              <div className="welcome-wave">
                <Radio size={60} />
              </div>
              <h1>
                From a distressed voice
                <br />
                to an informed response.
              </h1>
              <p>
                A workspace for turning fragmented reports into
                <br />
                clear context, with a human always in control.
              </p>
              <button
                className="primary large"
                disabled={busy || loading}
                onClick={start}
              >
                {loading
                  ? "Connecting…"
                  : busy
                    ? "Starting…"
                    : "Start demo session"}
                <ArrowRight size={19} />
              </button>
              <div className="welcome-pillars">
                <span>
                  <Mic size={18} />
                  Voice-first intake
                </span>
                <span>
                  <Activity size={18} />
                  Evidence-linked briefs
                </span>
                <span>
                  <ShieldCheck size={18} />
                  Human verification
                </span>
              </div>
              <p className="welcome-fine">
                Fictional scenarios · Private demo session · No real dispatch
              </p>
            </section>
          ) : view === "caller" ? (
            <CallerView
              samples={samples}
              mode={mode}
              busy={busy}
              onSubmit={submit}
            />
          ) : (
            <ResponderView
              incidents={incidents}
              selected={selected}
              busy={busy}
              onSelect={select}
              onSave={save}
              onDecide={decide}
              onRetry={() => selected && void act(() => analyze(selected))}
            />
          )}
          <footer>
            Designed to support a responder’s judgment.
            <span>Google Cloud AI Builder Cup · Prototype</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
