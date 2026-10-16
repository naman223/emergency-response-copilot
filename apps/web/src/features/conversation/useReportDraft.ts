import { useEffect, useRef, useState } from "react";
import { reportPreviewSchema, type ReportPreview } from "@copilot/contracts";
import { apiRequest } from "../../api";

export function useReportDraft(mode: string) {
  const [text, setText] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File>();
  const [processing, setProcessing] = useState<"audio" | "text" | null>(null);
  const [message, setMessage] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [failed, setFailed] = useState<"audio" | "text" | null>(null);
  const [candidate, setCandidate] = useState<ReportPreview>();
  const [recordingUrl, setRecordingUrl] = useState<string>();
  const current = useRef({
    text: "",
    description: "",
    textVersion: 0,
    locationVersion: 0,
  });
  const generated = useRef({ text: "", location: "" });
  const request = useRef<{ sequence: number; controller?: AbortController }>({
    sequence: 0,
  });
  useEffect(
    () => () => {
      request.current.sequence++;
      request.current.controller?.abort();
    },
    [],
  );
  useEffect(() => {
    if (!file) {
      setRecordingUrl(undefined);
      return;
    }
    const url = URL.createObjectURL(file);
    setRecordingUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  function editText(value: string) {
    current.current.text = value;
    current.current.textVersion++;
    setText(value);
    // A location extracted from an older report is no longer a current suggestion.
    if (
      generated.current.location &&
      current.current.description === generated.current.location
    ) {
      editLocation("");
    }
  }
  function editLocation(value: string) {
    current.current.description = value;
    current.current.locationVersion++;
    generated.current.location = "";
    setDescription(value);
  }
  function cancel() {
    request.current.sequence++;
    request.current.controller?.abort();
    setProcessing(null);
  }
  function stopPreview() {
    const kind = processing;
    cancel();
    setFailed(kind);
    setMessage(
      kind === "audio"
        ? "Transcription stopped. Your recording is still attached. Retry or type your report."
        : "Location lookup stopped. Your report is unchanged.",
    );
  }
  async function preview(audio?: File) {
    cancel();
    setCandidate(undefined);
    setFailed(null);
    if (mode !== "live") {
      setMessage(
        "Speech-to-text requires live Gemini. You can type your report or start with the attached recording.",
      );
      return;
    }
    const start = { ...current.current };
    const controller = new AbortController();
    const sequence = ++request.current.sequence;
    request.current.controller = controller;
    setProcessing(audio ? "audio" : "text");
    setMessage("");
    setElapsedSeconds(0);
    const startedAt = Date.now();
    const progress = setInterval(() => {
      if (sequence === request.current.sequence)
        setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    const timeout = setTimeout(() => controller.abort(), 55000);
    try {
      let body: BodyInit;
      if (audio) {
        const form = new FormData();
        form.append("audio", audio);
        body = form;
      } else body = JSON.stringify({ text: start.text.trim() });
      const result = reportPreviewSchema.parse(
        await apiRequest("/report-preview", {
          method: "POST",
          body,
          signal: controller.signal,
        }),
      );
      if (sequence !== request.current.sequence) return;
      if (!audio && current.current.textVersion !== start.textVersion) {
        setMessage(
          "The report changed while extracting the location. Try again using the updated text.",
        );
        return;
      }
      const reportUnchanged = current.current.textVersion === start.textVersion;
      if (audio && result.transcript) {
        if (
          !start.text.trim() &&
          current.current.textVersion === start.textVersion
        ) {
          editText(result.transcript);
          generated.current.text = result.transcript;
        } else setCandidate(result);
      }
      if (
        reportUnchanged &&
        result.locationDescription &&
        !current.current.description.trim() &&
        current.current.locationVersion === start.locationVersion
      ) {
        editLocation(result.locationDescription);
        generated.current.location = result.locationDescription;
      }
      setMessage(
        audio
          ? result.transcript
            ? "Transcript ready. Review the text and reported location, then start the conversation."
            : "No intelligible speech was detected. Try recording again or type your report."
          : result.locationDescription
            ? "Reported location found. Check it before starting the conversation."
            : "No clear incident location was found. Enter it manually or leave it unknown.",
      );
    } catch (e) {
      if (sequence !== request.current.sequence) return;
      setFailed(audio ? "audio" : "text");
      setMessage(
        controller.signal.aborted
          ? "Preview timed out. Retry or type your report; the recording remains attached."
          : (e as Error).message,
      );
    } finally {
      clearTimeout(timeout);
      clearInterval(progress);
      if (sequence === request.current.sequence) setProcessing(null);
    }
  }
  function attach(audio: File) {
    if (
      generated.current.text &&
      current.current.text === generated.current.text
    )
      editText("");
    if (
      generated.current.location &&
      current.current.description === generated.current.location
    )
      editLocation("");
    generated.current.text = "";
    setFile(audio);
    void preview(audio);
  }
  function remove() {
    cancel();
    setFile(undefined);
    setCandidate(undefined);
    setFailed(null);
    setMessage("Recording removed. Your text is still available to edit.");
  }
  function applyTranscript() {
    if (!candidate) return;
    editText(candidate.transcript);
    generated.current.text = candidate.transcript;
    if (!current.current.description.trim() && candidate.locationDescription) {
      editLocation(candidate.locationDescription);
      generated.current.location = candidate.locationDescription;
    }
    setCandidate(undefined);
  }
  return {
    text,
    description,
    file,
    processing,
    elapsedSeconds,
    message,
    failed,
    candidate,
    recordingUrl,
    editText,
    editLocation,
    attach,
    preview,
    cancel,
    stopPreview,
    remove,
    applyTranscript,
  };
}
