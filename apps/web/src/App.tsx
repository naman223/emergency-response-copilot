import { useEffect, useState } from "react";
import {
  Activity,
  Plus,
  MessageSquare,
  ShieldCheck,
  RotateCcw,
  Radio,
} from "lucide-react";
import type { Incident, IntakeRequest } from "@copilot/contracts";
import { serviceSchema, type ResponseService } from "@copilot/contracts";
import { ServiceIncidentView } from "./features/conversation/ServiceIncidentView";
import { auth, clearUser } from "./firebase";
import { apiRequest } from "./api";
import type { Sample } from "./features/caller/CallerView";
import { StartIncident } from "./features/conversation/StartIncident";
import { ConversationWorkspace } from "./features/conversation/ConversationWorkspace";
export default function App() {
  const [recipient, setRecipient] = useState<ResponseService | null>(null);
  const [notificationUnavailable, setNotificationUnavailable] = useState(false);
  const [ready, setReady] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [mode, setMode] = useState("fixture"),
    [samples, setSamples] = useState<Sample[]>([]),
    [incidents, setIncidents] = useState<Incident[]>([]),
    [selected, setSelected] = useState(""),
    [initial, setInitial] = useState("");
  function select(id: string) {
    setRecipient(null);
    setNotificationUnavailable(false);
    if (window.location.search) window.history.replaceState(null, "", "/");
    setSelected(id);
    setInitial("");
    sessionStorage.setItem("copilot-incident", id);
  }
  function update(i: Incident) {
    setIncidents((old) =>
      [i, ...old.filter((x) => x.id !== i.id)].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      ),
    );
  }
  async function start() {
    setBusy(true);
    setError("");
    try {
      const s = await apiRequest<{ mode: string }>("/session", {
        method: "POST",
      });
      const rows = await apiRequest<Incident[]>("/incidents");
      setMode(s.mode);
      setIncidents(rows);
      const saved = sessionStorage.getItem("copilot-incident");
      const params = new URLSearchParams(window.location.search);
      if (params.has("incident") || params.has("service")) {
        const service = serviceSchema.safeParse(params.get("service"));
        const incident = rows.find((i) => i.id === params.get("incident"));
        if (
          service.success &&
          incident?.reviewState === "approved" &&
          incident.dispatchReceipt?.smsMessages?.some(
            (m) => m.service === service.data,
          )
        ) {
          setSelected(incident.id);
          setRecipient(service.data);
        } else setNotificationUnavailable(true);
      } else if (saved && rows.some((i) => i.id === saved)) setSelected(saved);
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
      .catch(() =>
        setError(
          "The local API is unavailable. Please check the development server.",
        ),
      );
    auth.authStateReady().then(() => {
      if (alive) {
        if (auth.currentUser) void start();
        else setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, []);
  async function submit(metadata: IntakeRequest, file?: File) {
    setBusy(true);
    setError("");
    try {
      let body: BodyInit;
      if (file) {
        const form = new FormData();
        form.append("metadata", JSON.stringify(metadata));
        form.append("audio", file);
        body = form;
      } else body = JSON.stringify(metadata);
      const i = await apiRequest<Incident>("/incidents", {
        method: "POST",
        body,
      });
      update(i);
      setSelected(i.id);
      setInitial(i.id);
      sessionStorage.setItem("copilot-incident", i.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function reset() {
    setBusy(true);
    try {
      await apiRequest("/session", { method: "DELETE" });
      await clearUser();
      sessionStorage.removeItem("copilot-incident");
      setReady(false);
      setSelected("");
      setRecipient(null);
      setNotificationUnavailable(false);
      window.history.replaceState(null, "", "/");
      setInitial("");
      setIncidents([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="officer-app">
      <aside className="officer-sidebar">
        <a className="officer-brand" href="/">
          <span>
            <Activity size={23} />
          </span>
          <div>
            response<small>COPILOT</small>
          </div>
        </a>
        <div className="sidebar-caption">SECURITY OPERATIONS</div>
        <button
          className="new-incident"
          disabled={!ready}
          onClick={() => select("")}
        >
          <Plus size={17} />
          New incident
        </button>
        <div className="sidebar-section-title">
          CONVERSATIONS <span>{incidents.length}</span>
        </div>
        <nav aria-label="Incident conversations">
          {incidents.map((i) => (
            <button
              key={i.id}
              className={`conversation-nav ${selected === i.id ? "selected" : ""}`}
              onClick={() => select(i.id)}
            >
              <MessageSquare size={16} />
              <div>
                <strong>
                  {i.assessment?.locationDescription ||
                    `Incident ${i.id.slice(0, 6).toUpperCase()}`}
                </strong>
                <span>
                  {i.reviewState === "approved"
                    ? "Simulation complete"
                    : i.reviewState === "closed"
                      ? "Closed"
                      : i.assessment?.summary?.slice(0, 60) ||
                        "Report received"}
                </span>
              </div>
            </button>
          ))}
          {!incidents.length && (
            <p className="sidebar-empty">
              Your incident conversations
              <br />
              will appear here.
            </p>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div>
            <span className="coordinator-emblem">
              <Radio size={18} />
            </span>
            <div>
              <strong>AI emergency coordinator</strong>
              <small>
                {mode === "fixture"
                  ? "Local demonstration"
                  : "Gemini connected"}
              </small>
            </div>
          </div>
          <button onClick={reset} disabled={!ready || busy}>
            <RotateCcw size={14} />
            Reset session
          </button>
        </div>
      </aside>
      <main className="officer-main">
        <div className="simulation-strip">
          <span>
            <ShieldCheck size={14} />
            <strong>SIMULATION</strong> No emergency services are contacted.
          </span>
          <button
            className="mobile-reset"
            disabled={!ready || busy}
            onClick={reset}
          >
            Reset session
          </button>
        </div>
        <div className="mobile-nav">
          <strong>response copilot</strong>
          {ready && (
            <>
              <button onClick={() => select("")}>New incident</button>
              <select
                aria-label="Choose incident conversation"
                value={selected}
                onChange={(e) => select(e.target.value)}
              >
                <option value="">New report</option>
                {incidents.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.id.slice(0, 6).toUpperCase()}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
        {error && (
          <div className="app-error" role="alert">
            {error}
          </div>
        )}
        {loading ? (
          <div className="entry-screen">
            <p>Opening your workspace…</p>
          </div>
        ) : !ready ? (
          <div className="entry-screen">
            <span className="entry-emblem">
              <Radio size={40} />
            </span>
            <span className="caps">A CLEARER FIRST RESPONSE</span>
            <h1>
              Your report starts
              <br />a conversation.
            </h1>
            <p>
              Talk through an incident with an AI emergency coordinator. Clarify
              what’s known, keep track of what isn’t, and stay in control of the
              decision.
            </p>
            <button className="primary" disabled={busy} onClick={start}>
              {busy ? "Starting…" : "Start demo session"}
            </button>
            <small>
              {mode === "live"
                ? "Live Gemini · Human-reviewed simulation"
                : "Five fictional scenarios · Scripted local demonstration"}
            </small>
          </div>
        ) : notificationUnavailable ? (
          <section className="entry-screen">
            <h1>Notification unavailable</h1>
            <p>
              This link requires the original authenticated demo session and an
              approved notification. No incident details are available in this
              session.
            </p>
            <button className="secondary" onClick={() => select("")}>
              Return to workspace
            </button>
          </section>
        ) : recipient && incidents.find((i) => i.id === selected) ? (
          <ServiceIncidentView
            incident={incidents.find((i) => i.id === selected)!}
            service={recipient}
            onBack={() => select(selected)}
          />
        ) : selected ? (
          <ConversationWorkspace
            key={selected}
            id={selected}
            initial={initial === selected}
            mode={mode}
            onUpdate={update}
          />
        ) : (
          <StartIncident
            mode={mode}
            samples={samples}
            busy={busy}
            onStart={submit}
          />
        )}
      </main>
    </div>
  );
}
