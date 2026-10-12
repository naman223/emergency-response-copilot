import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AppError } from "../errors";
const run = promisify(execFile);
export const MAX_BYTES = 10 * 1024 * 1024;
export async function validateAudio(
  input: Uint8Array,
): Promise<{ wav: Uint8Array; durationSeconds: number }> {
  if (!input.length || input.length > MAX_BYTES)
    throw new AppError(
      413,
      "AUDIO_SIZE",
      "Choose an audio file smaller than 10 MiB.",
    );
  const dir = await mkdtemp(join(tmpdir(), "copilot-audio-"));
  const source = join(dir, "input");
  const output = join(dir, "output.wav");
  try {
    await writeFile(source, input);
    const { stdout } = await run(
      "ffprobe",
      [
        "-v",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-show_entries",
        "format=format_name,duration:stream=codec_type",
        "-of",
        "json",
        source,
      ],
      { timeout: 10000, maxBuffer: 64000 },
    );
    const p = JSON.parse(stdout);
    const duration = Number(p.format?.duration);
    const formats = String(p.format?.format_name).split(",");
    if (
      !formats.some((f) =>
        [
          "wav",
          "mp3",
          "matroska",
          "webm",
          "mov",
          "mp4",
          "m4a",
          "3gp",
          "3g2",
          "mj2",
        ].includes(f),
      ) ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > 60.001 ||
      !p.streams?.some((s: any) => s.codec_type === "audio")
    )
      throw new Error("Invalid media");
    await run(
      "ffmpeg",
      [
        "-v",
        "error",
        "-nostdin",
        "-protocol_whitelist",
        "file,pipe",
        "-i",
        source,
        "-map",
        "0:a:0",
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-t",
        "60.01",
        "-c:a",
        "pcm_s16le",
        output,
      ],
      { timeout: 10000, maxBuffer: 64000 },
    );
    return { wav: await readFile(output), durationSeconds: duration };
  } catch {
    throw new AppError(
      400,
      "INVALID_AUDIO",
      "Use a valid WAV, MP3, WebM or MP4 recording up to 60 seconds.",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
