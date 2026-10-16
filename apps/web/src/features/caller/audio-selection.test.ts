import { expect, it } from "vitest";
import { audioSelectionError } from "./audio-selection";

it("rejects an empty audio file", () => {
  expect(audioSelectionError(new File([], "empty.wav"))).toBeTruthy();
});
it("allows an audio file exactly at the 10 MiB upload limit", () => {
  expect(
    audioSelectionError(
      new File([new Uint8Array(10 * 1024 * 1024)], "limit.wav"),
    ),
  ).toBeNull();
});
it("rejects an audio file one byte over the upload limit", () => {
  expect(
    audioSelectionError(
      new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.wav"),
    ),
  ).toBeTruthy();
});
it("allows a small nonempty selection for content validation by the API", () => {
  expect(
    audioSelectionError(new File([new Uint8Array(256)], "sample.webm")),
  ).toBeNull();
});
