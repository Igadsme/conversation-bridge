import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useScribe } from "@elevenlabs/react";
import {
  Check,
  Ear,
  Hand,
  Loader2,
  Mic,
  Pencil,
  Repeat,
  Send,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { PrototypeNote, Shell } from "@/components/sora-ui";
import Recognizer from "@/recognizer";
import {
  getScribeToken,
  invalidateSpeechCache,
  startSpeech,
} from "@/lib/relay-services";
import { localReplies, suggestAiReplies } from "@/lib/smart-replies";
import {
  loadSettings,
  saveSettings,
  SETTINGS_EVENT,
  type CaptionSize,
  type SoraSettings,
} from "@/lib/settings";
import "@/sora-tools.css";

export const Route = createFileRoute("/face-to-face")({
  head: () => ({
    meta: [
      { title: "Sora — Bridging Conversations" },
      {
        name: "description",
        content:
          "One device between a Deaf signer and a hearing person: two panels, large captions on both sides.",
      },
      { property: "og:title", content: "Face to Face — Sora" },
      { property: "og:description", content: "Two panels, one conversation, both sides of the table." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  // Camera, microphone, on-device models and the realtime
  // ElevenLabs connection are all browser-only.
  ssr: false,
  component: FaceToFace,
});

type Speaker = "signer" | "hearing";
type Source = "sign" | "speech" | "text" | "reply";
type Message = {
  id: number;
  speaker: Speaker;
  text: string;
  at: number;
  source: Source;
  status: "pending" | "confirmed";
};

const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

const SOURCE_LABEL: Record<Source, string> = {
  sign: "sign",
  speech: "speech",
  text: "typed",
  reply: "quick reply",
};

// Turn Scribe SDK errors into something the participant can act on
function friendlyError(error: Error | Event): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/permission|NotAllowedError|denied|blocked/i.test(message)) {
    return "Microphone access is blocked. Allow it in the address bar (site settings), then try again.";
  }
  return message;
}

// The local suggestions always work; AI is a bonus, never a requirement.
function friendlyAiError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (/not configured/i.test(message)) {
    return "AI suggestions need a Gemini key on the server. The local suggestions still work.";
  }
  if (/quota|rate|429/i.test(message)) {
    return "AI suggestions are rate-limited right now. The local suggestions still work.";
  }
  return "AI suggestions are unavailable. The local suggestions still work.";
}

type PanelProps = {
  speaker: Speaker;
  // Face-to-face mode turns the hearing person's panel around
  // (pure CSS rotation - no orientation library).
  rotated: boolean;
  signMode: boolean;
  messages: Message[];
  pending: Message[];
  partial: string;
  listening: boolean;
  busy: "speak" | "listen" | null;
  error: string | null;
  editing: { id: number; draft: string } | null;
  typed: string;
  suggestions: string[];
  aiReplies: string[];
  aiLoading: boolean;
  aiError: string | null;
  onToggleMode: () => void;
  onTypedChange: (value: string) => void;
  onSendTyped: () => void;
  onConfirm: (id: number) => void;
  onCancelPending: (id: number) => void;
  onStartEdit: (id: number) => void;
  onDraftChange: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onRepeat: (id: number) => void;
  onAddReply: (text: string) => void;
  onSuggestAi: () => void;
  onApprovedSentence: (sentence: string) => void;
};

function Panel(props: PanelProps) {
  const { speaker, rotated } = props;
  const isSigner = speaker === "signer";
  const Icon = isSigner ? Hand : Ear;

  // Each panel scrolls its own copy of the shared history.
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [props.messages.length, props.pending.length, props.partial]);

  return (
    <section
      aria-label={isSigner ? "Signer panel" : "Hearing person panel"}
      className={`flex h-full min-h-[34rem] flex-col gap-4 rounded-3xl border p-5 shadow-soft transition-transform md:min-h-[42rem] md:p-6 ${
        rotated ? "rotate-180" : ""
      } ${isSigner ? "border-lavender-strong/40 bg-lavender/20" : "border-teal-strong/40 bg-teal/10"}`}
    >
      <header className="flex items-center gap-2">
        <Icon className="h-5 w-5" aria-hidden />
        <h2 className="font-display text-lg font-semibold">
          {isSigner ? "Signer" : "Hearing"}
        </h2>
        <span className="ml-auto text-xs text-muted-foreground">
          {isSigner ? "signs · reads captions" : "speaks · reads captions"}
        </span>
      </header>

      {/* Live speech transcription - prominent in both panels */}
      <div
        className="rounded-2xl border border-border bg-card p-4 md:p-5"
        aria-live={isSigner ? "polite" : undefined}
      >
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Live captions
        </p>
        <p
          className={`caption-text mt-2 min-h-16 font-display text-3xl font-semibold leading-tight md:min-h-24 md:text-4xl ${
            props.partial ? "opacity-80" : "text-muted-foreground"
          }`}
        >
          {props.partial || (props.listening ? "Listening…" : "Speech captions appear here")}
          {props.partial && <span className="caret">▍</span>}
        </p>
      </div>

      {/* Shared conversation history - the same messages on both sides */}
      <div
        className="min-h-52 flex-1 space-y-3 overflow-y-auto md:min-h-80 md:max-h-[32rem]"
        aria-label="Conversation history"
      >
        {props.messages.length === 0 && props.pending.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border p-5 text-center text-base text-muted-foreground">
            No messages yet. Sign, speak, type, or tap a suggestion.
          </p>
        )}
        {props.messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            editing={props.editing}
            busy={props.busy}
            onStartEdit={props.onStartEdit}
            onDraftChange={props.onDraftChange}
            onSaveEdit={props.onSaveEdit}
            onCancelEdit={props.onCancelEdit}
            onRepeat={props.onRepeat}
          />
        ))}
        {props.pending.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            editing={props.editing}
            busy={props.busy}
            onConfirm={props.onConfirm}
            onCancelPending={props.onCancelPending}
            onStartEdit={props.onStartEdit}
            onDraftChange={props.onDraftChange}
            onSaveEdit={props.onSaveEdit}
            onCancelEdit={props.onCancelEdit}
          />
        ))}
        <div ref={endRef} />
      </div>

      {/* Smart replies: free local engine first, AI behind an explicit button */}
      <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Quick replies
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {props.suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => props.onAddReply(s)}
              disabled={props.busy === "speak"}
              className="focus-ring rounded-full border border-border px-4 py-2 text-base font-semibold transition hover:bg-muted disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={props.onSuggestAi}
            disabled={props.aiLoading || props.busy === "speak" || props.messages.length === 0}
            className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-primary/40 px-4 py-2 text-base font-semibold text-primary transition hover:bg-primary/10 disabled:opacity-50"
          >
            {props.aiLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
            )}
            {props.aiLoading ? "Thinking…" : "Suggest with AI"}
          </button>
          {props.aiError && (
            <span className="text-xs font-medium text-warning" role="status">
              {props.aiError}
            </span>
          )}
        </div>
        {props.aiReplies.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2" aria-label="AI suggestions">
            {props.aiReplies.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => props.onAddReply(s)}
                disabled={props.busy === "speak"}
                className="focus-ring rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-base font-semibold text-primary transition hover:bg-primary/20 disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Text-input fallback (works even without camera or microphone) */}
      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          props.onSendTyped();
        }}
        className="flex gap-3"
      >
        <label htmlFor={`typed-${speaker}`} className="sr-only">
          {isSigner ? "Type to speak" : "Type a caption"}
        </label>
        <input
          id={`typed-${speaker}`}
          value={props.typed}
          onChange={(event) => props.onTypedChange(event.target.value)}
          placeholder={isSigner ? "Type to speak…" : "Type a caption…"}
          disabled={props.busy === "speak"}
          className="h-14 min-w-0 flex-1 rounded-2xl border border-input bg-background px-5 text-lg focus-visible:outline-2 focus-visible:outline-ring"
        />
        <button
          type="submit"
          aria-label={isSigner ? "Send typed message" : "Send typed caption"}
          disabled={!props.typed.trim() || props.busy === "speak"}
          className="focus-ring grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-soft transition active:scale-95 disabled:opacity-50"
        >
          <Send className="h-5 w-5" aria-hidden />
        </button>
      </form>

      {/* Per-participant input mode: camera only when signing, mic only when listening */}
      <button
        type="button"
        onClick={props.onToggleMode}
        disabled={props.busy === "speak"}
        className={`focus-ring flex h-20 flex-col items-center justify-center gap-2 rounded-3xl text-lg font-display font-semibold shadow-soft transition active:scale-[0.98] disabled:opacity-50 md:h-24 ${
          isSigner ? "bg-grad-violet" : "bg-grad-teal"
        }`}
      >
        {isSigner ? (
          <>
            <Hand className="h-8 w-8" aria-hidden />
            {props.signMode ? "Camera on — sign now" : "Sign with camera"}
          </>
        ) : (
          <>
            <Mic
              className={`h-8 w-8 ${props.listening ? "animate-pulse" : ""}`}
              aria-hidden
            />
            {props.listening ? "Listening… (tap to stop)" : "Speech to text"}
          </>
        )}
      </button>

      {/* The sign pipeline itself, mounted only while the signer asks for it */}
      {isSigner && props.signMode && (
        <div className="sora-tools">
          <Recognizer onApprovedSentence={props.onApprovedSentence} />
        </div>
      )}

      {props.error && (
        <p className="text-center text-sm font-medium text-warning" role="alert">
          {props.error}
        </p>
      )}
    </section>
  );
}

type BubbleProps = {
  message: Message;
  editing: { id: number; draft: string } | null;
  busy: "speak" | "listen" | null;
  onConfirm?: (id: number) => void;
  onCancelPending?: (id: number) => void;
  onStartEdit: (id: number) => void;
  onDraftChange: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onRepeat?: (id: number) => void;
};

function MessageBubble({ message: m, ...props }: BubbleProps) {
  const isSigner = m.speaker === "signer";
  const editingThis = props.editing?.id === m.id;
  const confirmed = m.status === "confirmed";

  return (
    <article
      className={`msg-in rounded-2xl border p-3 ${
        confirmed
          ? isSigner
            ? "border-lavender-strong/40 bg-lavender/40"
            : "border-teal-strong/40 bg-teal/10"
          : "border-primary/40 bg-primary/10"
      }`}
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        {isSigner ? <Hand className="h-3.5 w-3.5" aria-hidden /> : <Ear className="h-3.5 w-3.5" aria-hidden />}
        {isSigner ? "Signer" : "Hearing"} · {SOURCE_LABEL[m.source]}
        {!confirmed && <span className="text-primary">· waiting</span>}
        <span className="ml-auto font-normal">{time(m.at)}</span>
      </p>

      {editingThis ? (
        <div className="mt-2">
          <label htmlFor={`edit-${m.id}`} className="sr-only">
            Edit message
          </label>
          <textarea
            id={`edit-${m.id}`}
            autoFocus
            value={props.editing!.draft}
            onChange={(event) =>
              // The parent owns the draft; keep typing here without
              // triggering any speech until Save.
              props.onDraftChange(event.target.value)
            }
            className="min-h-20 w-full rounded-xl border border-input bg-background p-2 text-base leading-snug focus-visible:outline-2 focus-visible:outline-ring"
          />
        </div>
      ) : (
        <p className="caption-text mt-1.5 font-medium leading-snug">{m.text}</p>
      )}

      {editingThis ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={props.onSaveEdit}
            disabled={!props.editing!.draft.trim()}
            className="focus-ring inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Check className="h-4 w-4" aria-hidden /> Save
          </button>
          <button
            type="button"
            onClick={props.onCancelEdit}
            className="focus-ring inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-sm font-semibold hover:bg-muted"
          >
            <X className="h-4 w-4" aria-hidden /> Cancel
          </button>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {confirmed && isSigner && (
            // Replays the cached audio; no second ElevenLabs request.
            <button
              type="button"
              onClick={() => props.onRepeat?.(m.id)}
              disabled={props.busy !== null}
              className="focus-ring inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-sm font-semibold hover:bg-muted disabled:opacity-50"
            >
              <Repeat className="h-4 w-4" aria-hidden /> Repeat
            </button>
          )}
          <button
            type="button"
            onClick={() => props.onStartEdit(m.id)}
            disabled={props.editing !== null}
            className="focus-ring inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-sm font-semibold hover:bg-muted disabled:opacity-50"
          >
            <Pencil className="h-4 w-4" aria-hidden /> Edit
          </button>
          {!confirmed && (
            <>
              <button
                type="button"
                onClick={() => props.onConfirm?.(m.id)}
                disabled={props.busy === "speak" && isSigner}
                className="focus-ring inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                <Check className="h-4 w-4" aria-hidden /> Confirm
              </button>
              <button
                type="button"
                onClick={() => props.onCancelPending?.(m.id)}
                className="focus-ring inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-sm font-semibold hover:bg-muted"
              >
                <X className="h-4 w-4" aria-hidden /> Cancel
              </button>
            </>
          )}
        </div>
      )}
    </article>
  );
}

function FaceToFace() {
  // One shared conversation for both panels.
  const [history, setHistory] = useState<Message[]>([]);
  const [pending, setPending] = useState<Message[]>([]);
  // Live interim transcript stays out of the history until committed.
  const [partial, setPartial] = useState("");
  const [faceToFace, setFaceToFace] = useState(true);
  const [signMode, setSignMode] = useState(false);
  const [signerTyped, setSignerTyped] = useState("");
  const [hearingTyped, setHearingTyped] = useState("");
  const [busy, setBusy] = useState<"speak" | "listen" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: number; draft: string } | null>(null);
  const [captionSize, setCaptionSize] = useState<CaptionSize>(() => loadSettings().captionSize);
  const [aiReplies, setAiReplies] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const id = useRef(1);

  const scribe = useScribe({
    modelId: "scribe_v2_realtime",
    onPartialTranscript: ({ text }) => setPartial(text.trim()),
    onCommittedTranscript: ({ text }) => {
      const clean = text.trim();
      if (!clean) return;
      setPartial("");
      addPending("hearing", clean, "speech");
    },
    onError: (scribeError) => {
      setError(friendlyError(scribeError));
      setBusy((current) => (current === "listen" ? null : current));
    },
  });

  useEffect(() => () => scribe.disconnect(), []);
  useEffect(() => {
    const onSettings = (event: Event) =>
      setCaptionSize((event as CustomEvent<SoraSettings>).detail.captionSize);
    window.addEventListener(SETTINGS_EVENT, onSettings);
    return () => window.removeEventListener(SETTINGS_EVENT, onSettings);
  }, []);

  // Local suggestions come from the last message, free and instant.
  const lastMessage = history.at(-1) ?? pending.at(-1);
  const suggestions = useMemo(
    () => localReplies(lastMessage?.text ?? ""),
    [lastMessage?.text],
  );

  const listening = scribe.status === "connecting" || scribe.isConnected;

  function addPending(speaker: Speaker, text: string, source: Source) {
    setPending((p) => [...p, { id: id.current++, speaker, text, at: Date.now(), source, status: "pending" }]);
  }

  // Speak confirmed signer text through the existing ElevenLabs
  // pipeline, with the session audio cache. If speech fails, the
  // message stays on screen so the other person can still read it.
  async function speak(text: string) {
    setBusy("speak");
    setError(null);
    try {
      const playback = await startSpeech(text, loadSettings().speechRate, { cache: true });
      await playback.finished;
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : "unknown error";
      setError(`Couldn't speak it aloud (${detail}). Show the screen to the other person instead.`);
    } finally {
      setBusy(null);
    }
  }

  function confirmPending(messageId: number) {
    const message = pending.find((m) => m.id === messageId);
    if (!message) return;
    setPending((p) => p.filter((m) => m.id !== messageId));
    setHistory((h) => [...h, { ...message, status: "confirmed" }]);
    // Only the signer's side is spoken aloud, and only after Confirm.
    if (message.speaker === "signer") void speak(message.text);
  }

  function cancelPending(messageId: number) {
    setPending((p) => p.filter((m) => m.id !== messageId));
  }

  function startEdit(messageId: number) {
    const message = pending.find((m) => m.id === messageId) ?? history.find((m) => m.id === messageId);
    if (message) setEditing({ id: messageId, draft: message.text });
  }

  function saveEdit() {
    if (!editing) return;
    const draft = editing.draft.trim();
    if (!draft) return;
    const target = pending.find((m) => m.id === editing.id) ?? history.find((m) => m.id === editing.id);
    if (!target) {
      setEditing(null);
      return;
    }
    // The old wording's audio is stale now: drop it from the cache
    // so the next Repeat reflects the corrected message.
    if (target.status === "confirmed" && target.speaker === "signer") {
      invalidateSpeechCache(target.text);
    }
    const updated = { ...target, text: draft };
    setPending((p) => p.map((m) => (m.id === target.id ? updated : m)));
    setHistory((h) => h.map((m) => (m.id === target.id ? updated : m)));
    setEditing(null);
    // An explicit save re-speaks a corrected signer message.
    if (target.status === "confirmed" && target.speaker === "signer") void speak(draft);
  }

  function cancelEdit() {
    setEditing(null);
  }

  function repeat(messageId: number) {
    if (busy !== null) return;
    const message = history.find((m) => m.id === messageId);
    if (message && message.speaker === "signer") void speak(message.text);
  }

  async function toggleListen() {
    setError(null);
    if (scribe.isConnected) {
      scribe.disconnect();
      setPartial("");
      setBusy(null);
      return;
    }
    try {
      const token = await getScribeToken();
      await scribe.connect({
        token,
        microphone: { echoCancellation: true, noiseSuppression: true },
      });
      setBusy("listen");
    } catch (reason) {
      setError(friendlyError(reason instanceof Error ? reason : new Error(String(reason))));
    }
  }

  function toggleMode(speaker: Speaker) {
    if (speaker === "signer") {
      setSignMode((value) => !value);
    } else {
      void toggleListen();
    }
  }

  function sendTyped(speaker: Speaker, typed: string, setTyped: (value: string) => void) {
    const clean = typed.trim();
    if (!clean || busy === "speak") return;
    addPending(speaker, clean, "text");
    setTyped("");
  }

  function addReply(text: string, speaker: Speaker) {
    if (busy === "speak") return;
    addPending(speaker, text, "reply");
  }

  // Explicit button only: never called on transcript updates.
  async function requestAiReplies() {
    if (aiLoading) return;
    const context = [...history, ...pending].slice(-6).map((m) => m.text).join("\n");
    if (!context.trim()) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const replies = await suggestAiReplies(context);
      setAiReplies(replies);
    } catch (reason) {
      setAiError(friendlyAiError(reason));
    } finally {
      setAiLoading(false);
    }
  }

  function clearConversation() {
    setHistory([]);
    setPending([]);
    setPartial("");
    setAiReplies([]);
    setAiError(null);
    setEditing(null);
  }

  // The signer approved a translated sentence: it waits for Confirm
  // before anything is spoken.
  function handleApprovedSentence(sentence: string) {
    addPending("signer", sentence, "sign");
  }

  const panelCommon = {
    messages: history,
    pending,
    partial,
    listening,
    busy,
    error,
    editing,
    suggestions,
    aiReplies,
    aiLoading,
    aiError,
    onConfirm: confirmPending,
    onCancelPending: cancelPending,
    onStartEdit: startEdit,
    onDraftChange: (value: string) => setEditing((current) => (current ? { ...current, draft: value } : current)),
    onSaveEdit: saveEdit,
    onCancelEdit: cancelEdit,
    onRepeat: repeat,
    onSuggestAi: requestAiReplies,
  };

  return (
    <Shell title="Face to Face" wide extraWide>
      {/* Orientation, caption size and clear - the whole panel rotates,
          controls included, using CSS only. */}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          aria-pressed={faceToFace}
          onClick={() => setFaceToFace((value) => !value)}
          className="focus-ring inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold shadow-soft transition hover:bg-muted"
        >
          <Users className="h-4 w-4" aria-hidden />
          {faceToFace ? "Face-to-face on" : "Face-to-face off"}
        </button>
        <div
          role="group"
          aria-label="Caption text size"
          className="grid grid-cols-3 rounded-full border border-border bg-muted p-1"
        >
          {(["S", "M", "L"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={captionSize === v}
              onClick={() => {
                setCaptionSize(v);
                saveSettings({ ...loadSettings(), captionSize: v });
              }}
              className={`focus-ring h-9 rounded-full px-3 text-sm font-semibold transition ${
                captionSize === v ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {v === "S" ? "Small" : v === "M" ? "Medium" : "Large"}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={clearConversation}
          disabled={history.length === 0 && pending.length === 0}
          aria-label="Clear conversation"
          className="focus-ring inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold shadow-soft transition hover:bg-muted disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" aria-hidden /> Clear
        </button>
      </div>

      <p className="mt-2 text-center text-sm text-muted-foreground">
        One device between two people. In face-to-face mode the hearing person&apos;s panel
        turns around so both sides read it upright.
      </p>

      <div className="mt-4 grid items-stretch gap-5 md:grid-cols-2 xl:gap-6">
        <Panel
          {...panelCommon}
          speaker="signer"
          rotated={false}
          signMode={signMode}
          typed={signerTyped}
          onTypedChange={setSignerTyped}
          onSendTyped={() => sendTyped("signer", signerTyped, setSignerTyped)}
          onToggleMode={() => toggleMode("signer")}
          onAddReply={(text) => addReply(text, "signer")}
          onApprovedSentence={handleApprovedSentence}
        />
        <Panel
          {...panelCommon}
          speaker="hearing"
          rotated={faceToFace}
          signMode={signMode}
          typed={hearingTyped}
          onTypedChange={setHearingTyped}
          onSendTyped={() => sendTyped("hearing", hearingTyped, setHearingTyped)}
          onToggleMode={() => toggleMode("hearing")}
          onAddReply={(text) => addReply(text, "hearing")}
          onApprovedSentence={handleApprovedSentence}
        />
      </div>

      <PrototypeNote>
        Camera video and microphone audio stay in this browser. Nothing is spoken until the
        signer confirms it, and no AI suggestions are requested until you tap the button.
      </PrototypeNote>
    </Shell>
  );
}
