import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import type { VoiceCase } from "./voice-evaluation";
const root = resolve("fixtures/voice-evaluation");
const manifest = JSON.parse(
  await readFile(join(root, "manifest.json"), "utf8"),
) as VoiceCase[];
const temp = await mkdtemp(join(tmpdir(), "copilot-voice-"));
try {
  await mkdir(root, { recursive: true });
  for (const item of manifest) {
    if (!/^[a-z-]+\.wav$/.test(item.audio)) throw Error("Invalid fixture path");
    const output = join(root, item.audio);
    let args: string[];
    if (item.kind === "speech") {
      if (!item.voice || !["Samantha", "Rishi", "Lekha"].includes(item.voice))
        throw Error("Use an installed approved synthetic voice");
      const text = join(temp, "script.txt"),
        aiff = join(temp, "speech.aiff");
      await writeFile(text, item.script);
      execFileSync("say", [
        "-v",
        item.voice,
        "-r",
        String(item.rate ?? 175),
        "-f",
        text,
        "-o",
        aiff,
      ]);
      args = ["-i", aiff, ...(item.filter ? ["-af", item.filter] : [])];
    } else
      args = [
        "-f",
        "lavfi",
        "-i",
        item.signal === "silence"
          ? "anullsrc=r=16000:cl=mono"
          : "anoisesrc=color=white:amplitude=0.08:sample_rate=16000",
        "-t",
        "3",
      ];
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-y",
      ...args,
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      output,
    ]);
    const audio = await readFile(output);
    const duration = Number(
      execFileSync(
        "ffprobe",
        [
          "-v",
          "error",
          "-show_entries",
          "format=duration",
          "-of",
          "default=noprint_wrappers=1:nokey=1",
          output,
        ],
        { encoding: "utf8" },
      ).trim(),
    );
    if (
      !Number.isFinite(duration) ||
      duration > 60 ||
      audio.length > 10 * 1024 * 1024
    )
      throw Error("Fixture exceeds intake limits");
    item.sha256 = createHash("sha256").update(audio).digest("hex");
    item.durationSeconds = duration;
    console.log(item.id, duration.toFixed(1), "seconds");
  }
  await writeFile(
    join(root, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
} finally {
  await rm(temp, { recursive: true, force: true });
}
