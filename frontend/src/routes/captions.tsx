import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useScribe } from "@elevenlabs/react";
import { Mic, Square } from "lucide-react";
import { PrototypeNote, Shell, Wave } from "@/components/sora-ui";
import { getScribeToken } from "@/lib/relay-services";
import { loadSettings, saveSettings, SETTINGS_EVENT, type SoraSettings } from "@/lib/settings";

export const Route = createFileRoute("/captions")({
  head: () => ({
    meta: [
      { title: "Speech to Text — Sora" },
      { name: "description", content: "Large, readable live captions of what the hearing person says." },
      { property: "og:title", content: "Speech to Text — Sora" },
      { property: "og:description", content: "Large, readable live captions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  // Microphone + ElevenLabs realtime connection are browser-only.
  ssr: false,
  component: Captions,
});

const SIZES = { S: "text-2xl", M: "text-3xl", L: "text-4xl" } as const;

// Turn Scribe SDK errors into something the signer can act on
function friendlyError(error: Error | Event): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/permission|NotAllowedError|denied|blocked/i.test(message)) {
    return "Microphone access is blocked. Allow it in the address bar (site settings), then try again."
  }
  return message
}

function Captions() {
  const [on, setOn] = useState(false);
  const [partial, setPartial] = useState("");
  const [lines, setLines] = useState<string[]>([]);
  const [size, setSize] = useState<keyof typeof SIZES>(() => loadSettings().captionSize);
  const [error, setError] = useState<string | null>(null);

  const scribe = useScribe({
    modelId: "scribe_v2_realtime",
    onPartialTranscript: ({ text }) => setPartial(text.trim()),
    onCommittedTranscript: ({ text }) => {
      const clean = text.trim();
      if (!clean) return;
      setPartial("");
      setLines((current) => [...current, clean]);
    },
    onError: (scribeError) => {
      setOn(false);
      setPartial("");
      setError(friendlyError(scribeError));
    },
  });

  useEffect(() => () => scribe.disconnect(), []);
  useEffect(() => {
    const onSettings = (event: Event) => setSize((event as CustomEvent<SoraSettings>).detail.captionSize)
    window.addEventListener(SETTINGS_EVENT, onSettings)
    return () => window.removeEventListener(SETTINGS_EVENT, onSettings)
  }, []);

  async function toggle() {
    setError(null);
    if (scribe.isConnected) {
      scribe.disconnect();
      setOn(false);
      setPartial("");
      return;
    }
    try {
      // The backend mints a 15-minute, single-use token; the
      // permanent ElevenLabs key never enters the browser.
      const token = await getScribeToken();
      await scribe.connect({
        token,
        microphone: { echoCancellation: true, noiseSuppression: true },
      });
      setOn(true);
    } catch (scribeError) {
      setError(friendlyError(scribeError instanceof Error ? scribeError : new Error(String(scribeError))));
    }
  }

  const active = scribe.status === "connecting" || scribe.isConnected;
  const current = partial || lines[lines.length - 1] || "";

  return (
    <Shell title="Speech to Text">
      <div className="mt-6 flex flex-col items-center">
        <div className="relative grid h-40 w-40 place-items-center">
          {active && <span aria-hidden className="ring-pulse absolute inset-0 rounded-full bg-lavender-strong/40" />}
          <div className={`relative grid h-32 w-32 place-items-center rounded-full border-4 ${active ? "border-lavender-strong bg-lavender/60 shadow-glow" : "border-border bg-muted"}`}>
            <Mic className="h-12 w-12" aria-hidden />
          </div>
        </div>
        <p className="mt-4 font-display text-xl font-semibold" role="status">
          {scribe.status === "connecting" ? "Connecting…" : scribe.isConnected ? "Listening…" : "Paused"}
        </p>
        <p className="text-sm text-muted-foreground">{active ? "Speak naturally" : "Tap the button to start captions"}</p>
      </div>

      <section aria-live="polite" className="mt-6 rounded-3xl border border-border bg-card p-5 shadow-soft">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Live transcription</p>
        <p className={`caption-text mt-3 min-h-24 font-display font-semibold leading-tight ${SIZES[size]} ${partial ? "opacity-80" : ""}`}>
          {current || <span className="text-muted-foreground">Captions will appear here.</span>}
          {partial && <span className="caret">▍</span>}
        </p>
        <Wave active={active && !!partial} bars={22} className="mt-2 h-6" />
        {lines.length > 1 && (
          <ol className="mt-4 space-y-2 border-t border-border pt-4 text-muted-foreground">
            {lines.slice(0, -1).slice(-3).map((l, i) => <li key={i}>{l}</li>)}
          </ol>
        )}
        {error && <p className="mt-3 text-center text-sm font-medium text-warning">{error}</p>}
      </section>

      <div role="group" aria-label="Caption text size" className="mt-4 grid grid-cols-3 rounded-2xl border border-border bg-muted p-1">
        {(["S", "M", "L"] as const).map((v) => (
          <button key={v} type="button" aria-pressed={size === v} onClick={() => { setSize(v); saveSettings({ ...loadSettings(), captionSize: v }) }}
            className={`focus-ring h-10 rounded-xl text-sm font-semibold transition ${size === v ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"}`}>
            {v === "S" ? "Small" : v === "M" ? "Medium" : "Large"}
          </button>
        ))}
      </div>

      <div className="mt-6 flex justify-center">
        <button type="button" onClick={toggle} disabled={scribe.status === "connecting"} aria-label={on ? "Stop captions" : "Start captions"}
          className={`focus-ring grid h-20 w-20 place-items-center rounded-full shadow-soft transition active:scale-95 disabled:opacity-40 ${on ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground shadow-glow"}`}>
          {on ? <Square className="h-7 w-7 fill-current" aria-hidden /> : <Mic className="h-8 w-8" aria-hidden />}
        </button>
      </div>
      <PrototypeNote>
        Your voice goes to ElevenLabs only while captions are active. Nothing is stored.
      </PrototypeNote>
    </Shell>
  );
}
