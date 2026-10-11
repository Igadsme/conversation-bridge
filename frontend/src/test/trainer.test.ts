// In-browser trainer tests: the same recipe as scripts/train_personal.py,
// checked on made-up features where the right answer is known.
import { describe, expect, it } from "vitest";

import { dedupe, expandFrame, trainPersonalModel, type Sample } from "../trainer";

// Clips of each sign scatter around their own centre in 256 dimensions
function fakeSamples(signs: string[], perSign: number, seed = 1): Sample[] {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const centres = signs.map(() => Array.from({ length: 256 }, rand));
  return signs.flatMap((sign, k) =>
    Array.from({ length: perSign }, () => ({ sign, features: centres[k].map((c) => c + 0.3 * rand()) })),
  );
}

describe("trainPersonalModel", () => {
  it("learns separable signs and reports the check", async () => {
    const progress: number[] = [];
    const report = await trainPersonalModel(fakeSamples(["COFFEE", "HELLO", "MILK"], 12), (f) => progress.push(f));

    expect(report.accuracy).toBe(1);
    expect(report.signs).toBe(3);
    expect(report.clips).toBe(36);
    expect(report.tested).toBe(5 * 3 * 3); // 5 rounds x 3 signs x 3 held back
    expect(progress.at(-1)).toBe(1);

    // Same shape as personal_model.json: one row of 256 per sign
    const { model } = report;
    expect(model.signs).toEqual(["COFFEE", "HELLO", "MILK"]);
    expect(model.weights).toHaveLength(3);
    expect(model.weights[0]).toHaveLength(256);
    expect(model.mean).toHaveLength(256);
    expect(model.scale).toHaveLength(256);
    expect(model.bias).toHaveLength(3);
    expect(model.trainedOn).toEqual({ COFFEE: 12, HELLO: 12, MILK: 12 });
  });

  it("skips signs with too few examples", async () => {
    const samples = [...fakeSamples(["COFFEE", "HELLO"], 10), ...fakeSamples(["TEA"], 3, 7)];
    const report = await trainPersonalModel(samples);
    expect(report.model.signs).toEqual(["COFFEE", "HELLO"]);
    expect(report.skipped).toEqual({ TEA: 3 });
  });

  it("needs at least two signs", async () => {
    await expect(trainPersonalModel(fakeSamples(["COFFEE"], 15))).rejects.toThrow(/2 or more signs/);
  });
});

describe("expandFrame", () => {
  it("puts pose, left hand and right hand back in the 543-point frame", () => {
    const compact = Array.from({ length: 150 }, (_, i) => i);
    compact[0] = null as unknown as number; // pose point 0 x not seen
    const frame = expandFrame(compact);
    expect(frame).toHaveLength(543 * 3);
    expect(frame[489 * 3]).toBeNaN();
    expect(frame[489 * 3 + 1]).toBe(1); // pose point 0 y
    expect(frame[468 * 3]).toBe(66); // left hand point 0 x (after 33 pose points)
    expect(frame[522 * 3 + 1]).toBe(109); // right hand point 0 y
    expect(frame[0]).toBeNaN(); // face is not recorded
  });
});

describe("dedupe", () => {
  it("keeps each clip (sign + time) once", () => {
    const clip = { sign: "YES", recordedAt: "t1", start: 0, end: 1, frames: [] };
    expect(dedupe([clip, { ...clip }, { ...clip, recordedAt: "t2" }])).toHaveLength(2);
  });
});
