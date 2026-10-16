import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StartIncident } from "../src/features/conversation/StartIncident";
const state = vi.hoisted(() => ({ draft: {} as any }));
vi.mock("../src/features/conversation/useReportDraft", () => ({
  useReportDraft: () => state.draft,
}));
vi.mock("../src/firebase", () => ({ ensureUser: vi.fn() }));
beforeEach(() => {
  state.draft = {
    text: "",
    description: "",
    file: new File(["fictional audio"], "recording.webm"),
    recordingUrl: "blob:fictional-recording",
    processing: null,
    failed: null,
    message: "",
    elapsedSeconds: 0,
    candidate: undefined,
    attach() {},
    cancel() {},
    stopPreview() {},
    preview() {},
    remove() {},
    editText() {},
    editLocation() {},
    applyTranscript() {},
  };
});
function render() {
  return renderToStaticMarkup(
    <StartIncident
      mode="live"
      samples={[]}
      busy={false}
      onStart={async () => {}}
      onReset={() => {}}
    />,
  );
}
it("shows elapsed transcription time and a stop control above recording playback", () => {
  state.draft.processing = "audio";
  state.draft.elapsedSeconds = 20;
  const html = render();
  expect(html).toContain("20 seconds elapsed");
  expect(html).toContain("Stop transcription");
  expect(html.indexOf("20 seconds elapsed")).toBeLessThan(
    html.indexOf("<audio "),
  );
});
it("shows a prominent failed transcription and retry before recording playback", () => {
  state.draft.failed = "audio";
  state.draft.message =
    "Transcription timed out. Your recording is still attached.";
  const html = render();
  expect(html).toContain('role="alert"');
  expect(html.indexOf("Transcription timed out.")).toBeLessThan(
    html.indexOf("<audio "),
  );
  expect(html.indexOf("Retry transcription")).toBeLessThan(
    html.indexOf("<audio "),
  );
});
