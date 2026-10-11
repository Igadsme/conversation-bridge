// Segmenter tests: the clip-cutting rules that keep accidental
// recognition out of the sentence. Headless - no camera needed.
//
// Mechanics pinned here:
// - the first visible frame is kept as a resting frame, so a
//   gesture of N visible frames yields an (N-1)-frame clip
// - a sign ends after END_FRAMES (8) frames without hands; the
//   next PAD_FRAMES (20) frames become the previous clip's tail,
//   so a new sign must start ~0.7 s after the last one to be
//   cut whole - a quicker repeat loses its first frames to the
//   padding and is dropped as too short
import { describe, expect, it } from "vitest";

import { Segmenter, type SignClip } from "../segmenter";

const frame = () => new Float32Array(543 * 3).fill(0.5);
const idle = (n: number) => Array.from({ length: n }, () => [frame(), false] as const);
const up = (n: number) => Array.from({ length: n }, () => [frame(), true] as const);

function run(frames: ReadonlyArray<readonly [Float32Array, boolean]>): SignClip[] {
  const segmenter = new Segmenter();
  const clips: SignClip[] = [];
  for (const [f, hands] of frames) {
    const clip = segmenter.push(f, hands);
    if (clip) clips.push(clip);
  }
  return clips;
}

describe("Segmenter", () => {
  it("cuts one clip per sign with resting padding", () => {
    const clips = run([...idle(30), ...up(30), ...idle(40)]);
    expect(clips).toHaveLength(1);
    expect(clips[0].clip).toHaveLength(29);
    expect(clips[0].padded).toHaveLength(20 + 29 + 20);
    expect(clips[0].start).toBe(20);
  });

  it("drops a hand passing by (5 frames) as noise", () => {
    expect(run([...idle(30), ...up(5), ...idle(40)])).toHaveLength(0);
  });

  it("drops a 7-frame gesture but keeps a 9-frame one", () => {
    expect(run([...idle(30), ...up(7), ...idle(40)])).toHaveLength(0);
    const clips = run([...idle(30), ...up(9), ...idle(40)]);
    expect(clips).toHaveLength(1);
    expect(clips[0].clip).toHaveLength(8);
  });

  it("absorbs a brief hands-down flicker into the tail", () => {
    const clips = run([...idle(30), ...up(20), ...idle(8), ...up(20), ...idle(40)]);
    expect(clips).toHaveLength(1);
    expect(clips[0].clip).toHaveLength(19);
  });

  it("cuts two whole clips when the same sign is re-signed after a 1 s gap", () => {
    const clips = run([...idle(30), ...up(20), ...idle(30), ...up(20), ...idle(40)]);
    expect(clips).toHaveLength(2);
    expect(clips[1].clip).toHaveLength(19);
  });

  it("cuts off a sign that never drops at MAX_FRAMES", () => {
    const clips = run([...idle(30), ...up(200)]);
    expect(clips).toHaveLength(1);
    expect(clips[0].clip).toHaveLength(150);
  });

  it("starts fresh after reset()", () => {
    const segmenter = new Segmenter();
    for (let i = 0; i < 10; i++) segmenter.push(frame(), true);
    segmenter.reset();
    const clips: SignClip[] = [];
    for (const [f, hands] of [...idle(30), ...up(30), ...idle(40)]) {
      const clip = segmenter.push(f, hands);
      if (clip) clips.push(clip);
    }
    expect(clips).toHaveLength(1);
    expect(clips[0].clip).toHaveLength(29);
  });
});
