// Smart replies for Face-to-Face mode.
//
// Free, local engine first: instant, offline, no API. The
// "Suggest with AI" button optionally asks Gemini through the
// backend (POST /api/replies) - never called automatically,
// never called on every transcript update.
//
// Cost guards: suggestions are cached by normalized input text,
// and concurrent or duplicate requests for the same context share
// one in-flight promise.

export const LOCAL_REPLIES = [
  "Yes, please.",
  "No, thank you.",
  "Could you repeat that?",
  "I need help.",
  "Please speak more slowly.",
] as const

const QUESTION_RE = /\?\s*$/
const REPEAT_HINT_RE = /\b(repeat|again|sorry|pardon|what|huh|confus)\b/i
const SLOW_HINT_RE = /\b(fast|quickly|slow|speed)\b/i
const HELP_HINT_RE = /\b(help|emergency|waiter)\b/i

/** Pick up to three contextual replies from the free local set. */
export function localReplies(context: string): string[] {
  const text = context.trim().toLowerCase()
  if (!text) return LOCAL_REPLIES.slice(0, 3)

  const picks: string[] = []
  if (QUESTION_RE.test(text)) {
    picks.push("Yes, please.", "No, thank you.")
  }
  if (REPEAT_HINT_RE.test(text)) picks.push("Could you repeat that?")
  if (SLOW_HINT_RE.test(text)) picks.push("Please speak more slowly.")
  if (HELP_HINT_RE.test(text)) picks.push("I need help.")

  // Fill up to three, keeping the canonical order.
  for (const reply of LOCAL_REPLIES) {
    if (picks.length >= 3) break
    if (!picks.includes(reply)) picks.push(reply)
  }
  return picks.slice(0, 3)
}

export function normalizeReplyKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ")
}

// Session-only caches (nothing is persisted to disk).
const cache = new Map<string, string[]>()
const inFlight = new Map<string, Promise<string[]>>()

/** Cached AI suggestions for a context, if any. */
export function cachedReplies(context: string): string[] | undefined {
  return cache.get(normalizeReplyKey(context))
}

/** Ask the backend for up to three short AI suggestions.
 *  One request per context at a time; results are cached. */
export function suggestAiReplies(context: string): Promise<string[]> {
  const key = normalizeReplyKey(context)
  const hit = cache.get(key)
  if (hit) return Promise.resolve(hit)

  const pending = inFlight.get(key)
  if (pending) return pending

  const request = fetch("/api/replies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ context }),
  })
    .then(async (response) => {
      const body = (await response.json().catch(() => ({}))) as { error?: unknown; replies?: unknown }
      if (!response.ok) {
        throw new Error(typeof body.error === "string" ? body.error : `Request failed (${response.status})`)
      }
      const replies = Array.isArray(body.replies)
        ? body.replies.filter((r): r is string => typeof r === "string" && r.trim().length > 0)
        : []
      return replies.slice(0, 3)
    })
    .then((replies) => {
      cache.set(key, replies)
      return replies
    })
    .finally(() => {
      inFlight.delete(key)
    })

  inFlight.set(key, request)
  return request
}
