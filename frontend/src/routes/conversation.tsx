import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useScribe } from "@elevenlabs/react";
import { Check, Ear, Hand, Loader2, Mic, Pencil, RotateCcw, Send, Volume2 } from "lucide-react";
import { PrototypeNote, Shell } from "@/components/sora-ui";
import Recognizer from "@/recognizer";
import { getScribeToken, startSpeech } from "@/lib/relay-services";
import "@/sora-tools.css";

export const Route = createFileRoute("/conversation")({
  head: () => ({
    meta: [
      { title: "Conversation Mode — Sora" },
      { name: "description", content: "A two-way conversation: signed replies reviewed before speaking, spoken replies shown as captions." },
      { property: "og:title", content: "Conversation Mode — Sora" },
      { property: "og:description", content: "Two-way conversation with review-before-speaking." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  // Camera, microphone, on-device models and the realtime
  // ElevenLabs connection are all browser-only.
  ssr: false,
  component: Conversation,
});

type Msg = { id: number; who: "you" | "them"; text: string; at: number; typed?: boolean | undefined };
const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

// Turn Scribe SDK errors into something the signer can act on
function friendlyError(error: Error | Event): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/permission|NotAllowedError|denied|blocked/i.test(message)) {
    return "Microphone access is blocked. Allow it in the address bar (site settings), then try again."
  }
  return message
}

function Conversation() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  // "chat" = message list with the two mode buttons; "sign" = the real
  // sign pipeline (camera → recognition → sentence → translation → speak)
  const [view, setView] = useState<"chat" | "sign">("chat");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState<"speak" | "listen" | null>(null);
  const [partial, setPartial] = useState("");
  const [error, setError] = useState<string | null>(null);
  const id = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);

  const scribe = useScribe({
    modelId: "scribe_v2_realtime",
    onCommittedTranscript: ({ text }) => {
      const clean = text.trim();
      if (!clean) return;
      setPartial("");
      add("them", clean);
    },
    onError: (scribeError) => {
      setError(scribeError instanceof Error ? scribeError.message : "Live captions disconnected");
      setBusy((current) => (current === "listen" ? null : current));
    },
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [msgs.length, partial]);
  useEffect(() => () => scribe.disconnect(), []);

  function add(who: Msg["who"], text: string, typedMsg = false) {
    setMsgs((m) => [...m, { id: id.current++, who, text, at: Date.now(), typed: typedMsg }]);
  }

  // Signer approved a sentence in the sign pipeline: speak it with
  // ElevenLabs (via the backend) and only then add it to the chat.
  async function approveAndSpeak(text: string) {
    setBusy("speak");
    setError(null);
    try {
      const playback = await startSpeech(text);
      add("you", text);
      setView("chat");
      await playback.finished;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not speak the message");
    } finally {
      setBusy(null);
    }
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

  function sendTyped(event: FormEvent) {
    event.preventDefault();
    const text = typed.trim();
    if (!text || busy === "speak") return;
    void approveAndSpeak(text);
    setTyped("");
  }

  const listening = scribe.status === "connecting" || scribe.isConnected;

  if (view === "sign") {
    return (
      <Shell title="Conversation Mode" backTo="/conversation">
        <p className="mt-2 text-sm text-muted-foreground">
          Sign your reply. Review the English, then approve it — Sora speaks it into the conversation.
        </p>
        <div className="sora-tools">
          <Recognizer onApprovedSentence={(sentence) => void approveAndSpeak(sentence)} />
        </div>
        <PrototypeNote>Camera video stays in this browser. Nothing is spoken until you approve.</PrototypeNote>
      </Shell>
    );
  }

  return (
    <Shell title="Conversation Mode" action={
      <button type="button" aria-label="New conversation" disabled={!msgs.length || busy !== null}
        onClick={() => { setMsgs([]); setPartial(""); }}
        className="focus-ring grid h-11 w-11 place-items-center rounded-full hover:bg-muted">
        <RotateCcw className="h-5 w-5" aria-hidden />
      </button>
    }>
      <div className="flex-1 space-y-4 overflow-y-auto py-2" aria-live="polite">
        {msgs.length === 0 && !partial && (
          <p className="mt-10 rounded-3xl border border-dashed border-border p-6 text-center text-muted-foreground">
            Sign or type a message, or tap "Speech to Text" when the other person talks.
          </p>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={`msg-in rounded-3xl border p-4 shadow-soft ${m.who === "you" ? "ml-6 border-lavender-strong/40 bg-lavender/40" : "mr-6 border-border bg-card"}`}>
            <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              {m.who === "you" ? <Hand className="h-3.5 w-3.5" aria-hidden /> : <Ear className="h-3.5 w-3.5" aria-hidden />}
              {m.who === "you" ? (m.typed ? "You (typed)" : "You (sign)") : "Them (speech)"}
              <span className="ml-auto font-normal">{time(m.at)}</span>
            </p>
            <p className="mt-1.5 text-2xl font-medium leading-snug">{m.text}</p>
          </div>
        ))}
        {partial && (
          <div className="msg-in mr-6 rounded-3xl border border-border bg-card p-4">
            <p className="text-xs font-semibold text-muted-foreground">Them (speech) · hearing…</p>
            <p className="mt-1.5 text-2xl font-medium leading-snug opacity-80">{partial}<span className="caret">▍</span></p>
          </div>
        )}
        {error && <p className="text-center text-sm font-medium text-warning">{error}</p>}
        <div ref={endRef} />
      </div>

      <form onSubmit={sendTyped} className="mt-3 flex gap-2">
        <label htmlFor="typed" className="sr-only">Type to speak</label>
        <input id="typed" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type to speak…"
          className="h-12 flex-1 rounded-2xl border border-input bg-background px-4 text-base focus-visible:outline-2 focus-visible:outline-ring"
          disabled={busy === "speak"} />
        <button type="submit" aria-label="Speak typed message" disabled={!typed.trim() || busy === "speak"}
          className="focus-ring grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-soft transition active:scale-95 disabled:opacity-50">
          {busy === "speak" ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Send className="h-5 w-5" aria-hidden />}
        </button>
      </form>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <button type="button" onClick={() => setView("sign")} disabled={busy !== null}
          className="focus-ring flex h-28 flex-col items-center justify-center gap-2 rounded-3xl bg-grad-violet font-display font-semibold shadow-soft transition active:scale-[0.98] disabled:opacity-50">
          <Hand className="h-8 w-8" aria-hidden />
          Sign to Speech
        </button>
        <button type="button" onClick={toggleListen} disabled={busy === "speak"}
          className="focus-ring flex h-28 flex-col items-center justify-center gap-2 rounded-3xl bg-grad-teal font-display font-semibold shadow-soft transition active:scale-[0.98] disabled:opacity-50">
          <Mic className={`h-8 w-8 ${busy === "listen" ? "animate-pulse" : ""}`} aria-hidden />
          {busy === "listen" ? "Listening…" : "Speech to Text"}
        </button>
      </div>
      <PrototypeNote>
        Signed messages are reviewed before they are spoken. Your voice reaches ElevenLabs only while listening.
      </PrototypeNote>
    </Shell>
  );
}
