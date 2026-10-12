import { useEffect, useRef, useState } from "react";
import { Mic, Square, Upload, FileAudio } from "lucide-react";
export function AudioInput({
  onFile,
  disabled = false,
  onCaptureChange,
}: {
  onFile: (file: File) => void;
  disabled?: boolean;
  onCaptureChange?: (active: boolean) => void;
}) {
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);
  const pending = useRef(false);
  const activeStream = useRef<MediaStream | null>(null);
  const [recording, setRecording] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      activeStream.current?.getTracks().forEach((t) => t.stop());
      activeStream.current = null;
    };
  }, []);
  async function record() {
    if (disabled || pending.current || recorder.current?.state === "recording")
      return;
    pending.current = true;
    setWaiting(true);
    onCaptureChange?.(true);
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      activeStream.current = stream;
      const mime = ["audio/webm", "audio/mp4"].find((t) =>
        MediaRecorder.isTypeSupported(t),
      );
      const r = new MediaRecorder(
        stream,
        mime ? { mimeType: mime } : undefined,
      );
      recorder.current = r;
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      r.onstop = () => {
        if (timer.current) clearTimeout(timer.current);
        stream?.getTracks().forEach((t) => t.stop());
        activeStream.current = null;
        if (!mounted.current) return;
        const type = r.mimeType || "audio/webm";
        onFile(
          new File(
            chunks,
            `recording.${type.includes("mp4") ? "mp4" : "webm"}`,
            { type },
          ),
        );
        setRecording(false);
        onCaptureChange?.(false);
        setMessage("Recording ready to submit.");
      };
      r.start();
      setRecording(true);
      setMessage("Recording… stops automatically at 60 seconds.");
      timer.current = setTimeout(() => {
        if (r.state === "recording") r.stop();
      }, 60000);
    } catch {
      stream?.getTracks().forEach((t) => t.stop());
      activeStream.current = null;
      if (mounted.current) {
        setRecording(false);
        onCaptureChange?.(false);
        setMessage(
          "Microphone unavailable. Upload audio or choose a sample below.",
        );
      }
    } finally {
      pending.current = false;
      if (mounted.current) setWaiting(false);
    }
  }
  return (
    <div className="audio-input">
      <div className="capture-actions">
        <button
          type="button"
          className={recording ? "danger" : "secondary"}
          disabled={disabled || waiting}
          onClick={() => (recording ? recorder.current?.stop() : record())}
        >
          {recording ? <Square size={16} /> : <Mic size={16} />}{" "}
          {recording
            ? "Stop recording"
            : waiting
              ? "Waiting for microphone…"
              : "Record audio"}
        </button>
        <label className="button secondary">
          <Upload size={16} />
          Upload audio
          <input
            aria-label="Upload audio"
            type="file"
            disabled={disabled || recording || waiting}
            accept="audio/wav,audio/mpeg,audio/webm,audio/mp4,video/webm,video/mp4"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                onFile(f);
                setMessage(f.name);
              }
            }}
          />
        </label>
      </div>
      <p className="hint">
        <FileAudio size={14} />
        WAV, MP3, WebM or MP4 · up to 60 seconds · 10 MiB
      </p>
      {message && (
        <p className="inline-message" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
