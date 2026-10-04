import { it, expect } from "vitest";
import { validateAudio } from "../src/incidents/media";
function wav(seconds: number) {
  const size = seconds * 16000 * 2,
    b = Buffer.alloc(44 + size);
  b.write("RIFF");
  b.writeUInt32LE(36 + size, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24);
  b.writeUInt32LE(32000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(size, 40);
  return b;
}
it("accepts exactly sixty seconds and rejects longer decoded audio", async () => {
  expect((await validateAudio(wav(60))).durationSeconds).toBe(60);
  await expect(validateAudio(wav(61))).rejects.toThrow();
}, 15000);
it("rejects invalid and oversized input before inference", async () => {
  await expect(validateAudio(Buffer.from("not audio"))).rejects.toThrow();
  await expect(
    validateAudio(Buffer.alloc(10 * 1024 * 1024 + 1)),
  ).rejects.toThrow();
});
it("accepts short streaming WebM and rejects overlong decoded WebM", async () => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);
  for (const seconds of [1, 61]) {
    const { stdout } = await run(
      "ffmpeg",
      [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=16000:cl=mono",
        "-t",
        String(seconds),
        "-c:a",
        "libopus",
        "-f",
        "webm",
        "pipe:1",
      ],
      { encoding: "buffer", maxBuffer: 1048576 },
    );
    if (seconds === 1)
      expect((await validateAudio(stdout)).durationSeconds).toBeGreaterThan(0);
    else await expect(validateAudio(stdout)).rejects.toThrow();
  }
}, 15000);
