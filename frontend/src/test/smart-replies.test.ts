import { describe, expect, it, vi } from "vitest";
import {
  cachedReplies,
  localReplies,
  normalizeReplyKey,
  suggestAiReplies,
} from "@/lib/smart-replies";

describe("localReplies", () => {
  it("returns the default set for an empty context", () => {
    expect(localReplies("")).toEqual([
      "Yes, please.",
      "No, thank you.",
      "Could you repeat that?",
    ]);
  });

  it("answers questions with yes/no first", () => {
    const replies = localReplies("Would you like coffee?");
    expect(replies[0]).toBe("Yes, please.");
    expect(replies[1]).toBe("No, thank you.");
    expect(replies).toHaveLength(3);
  });

  it("suggests repeating when the context hints confusion", () => {
    expect(localReplies("sorry, what did you say")).toContain(
      "Could you repeat that?",
    );
  });

  it("suggests slowing down for fast-speech hints", () => {
    expect(localReplies("you talk too fast")).toContain(
      "Please speak more slowly.",
    );
  });

  it("never returns more than three", () => {
    for (const context of ["", "help please?", "repeat that again sorry"]) {
      expect(localReplies(context).length).toBeLessThanOrEqual(3);
    }
  });
});

describe("normalizeReplyKey", () => {
  it("collapses case and whitespace", () => {
    expect(normalizeReplyKey("  Hello   THERE ")).toBe("hello there");
  });
});

describe("suggestAiReplies", () => {
  it("caches by normalized input and never duplicates requests", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ replies: ["Sure.", "OK.", "Yes."] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      const first = await suggestAiReplies("Hello   there");
      const second = await suggestAiReplies("hello there");
      expect(first).toEqual(["Sure.", "OK.", "Yes."]);
      expect(second).toEqual(first);
      expect(cachedReplies("HELLO there")).toEqual(first);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("shares one request between concurrent callers", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ replies: ["A.", "B.", "C."] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      const [a, b] = await Promise.all([
        suggestAiReplies("What time is it"),
        suggestAiReplies("What time is it"),
      ]);
      expect(a).toEqual(b);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("limits suggestions to three", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ replies: ["a", "b", "c", "d", "e"] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      expect(await suggestAiReplies("limit check")).toHaveLength(3);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("propagates API errors", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        { error: "Gemini is not configured on the server" },
        { status: 503 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(suggestAiReplies("error check")).rejects.toThrow(
        /not configured/,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
