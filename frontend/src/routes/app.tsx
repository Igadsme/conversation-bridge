import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronRight, Hand, HelpCircle, MessagesSquare, Mic, Settings, Users } from "lucide-react";
import { PrivacyDialog, Shell, SoraMark } from "@/components/sora-ui";
import { checkHealth, type ServiceHealth } from "@/lib/relay-services";

export const Route = createFileRoute("/app")({
  head: () => ({ meta: [{ title: "Sora — Bridging Conversations" }] }),
  component: AppDashboard,
});

const modes = [
  { to: "/sign", title: "Sign to Speech", desc: "Show your signs, we'll speak for you", Icon: Hand, bg: "bg-grad-violet" },
  { to: "/captions", title: "Speech to Text", desc: "Speak and show text instantly", Icon: Mic, bg: "bg-grad-teal" },
  { to: "/conversation", title: "Conversation Mode", desc: "Two-way communication in real time", Icon: Users, bg: "bg-grad-slate" },
  { to: "/face-to-face", title: "Face to Face", desc: "One device, both sides of the table", Icon: MessagesSquare, bg: "bg-grad-violet" },
] as const;

function ServiceBadge({ label, ready }: { label: string; ready: boolean }) {
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${ready ? "border-teal-strong/40 bg-teal/10 text-teal-strong" : "border-border bg-muted/40 text-muted-foreground"}`}>{label} {ready ? "ready" : "not configured"}</span>;
}

function AppDashboard() {
  const [health, setHealth] = useState<ServiceHealth | null>(null);

  useEffect(() => {
    checkHealth().then(setHealth).catch(() => setHealth(null));
  }, []);

  return (
    <Shell>
      <div className="flex justify-between">
        <span className="mt-2 rounded-full border border-border bg-muted/60 px-3 py-1 text-xs font-semibold text-muted-foreground">Prototype</span>
        <PrivacyDialog />
      </div>
      <div className="fade-up mt-8 flex flex-col items-center text-center">
        <SoraMark className="h-12 w-20" />
        <h1 className="mt-3 font-display text-5xl font-semibold tracking-tight">Sora</h1>
        <p className="mt-3 max-w-xs text-muted-foreground">Bridging conversations for a more inclusive world.</p>
      </div>
      <nav aria-label="Modes" className="mt-10 space-y-4">
        {modes.map(({ to, title, desc, Icon, bg }, i) => <Link key={to} to={to} style={{ animationDelay: `${0.08 * (i + 1)}s` }} className={`fade-up focus-ring group flex items-center gap-4 rounded-3xl border border-border p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-glow ${bg}`}><Icon className="h-10 w-10 shrink-0" aria-hidden /><div className="min-w-0 flex-1"><p className="font-display text-lg font-semibold">{title}</p><p className="text-sm opacity-80">{desc}</p></div><ChevronRight className="h-5 w-5 shrink-0 transition group-hover:translate-x-1" aria-hidden /></Link>)}
      </nav>
      <div className="mt-6 text-center">
        <div className="flex justify-center gap-5 text-sm font-semibold"><Link to="/settings" className="inline-flex items-center gap-1.5 text-primary underline underline-offset-4"><Settings className="h-4 w-4" aria-hidden />Settings</Link><Link to="/how-it-works" className="inline-flex items-center gap-1.5 text-primary underline underline-offset-4"><HelpCircle className="h-4 w-4" aria-hidden />How it works</Link></div>
        <Link to="/record" className="mt-4 inline-block text-xs font-semibold text-muted-foreground underline underline-offset-4">Personal training &amp; model calibration</Link>
      </div>
      <div className="service-status mt-8 flex flex-wrap items-center justify-center gap-2" aria-live="polite"><ServiceBadge label="Gemini" ready={health?.services.gemini ?? false} /><ServiceBadge label="ElevenLabs" ready={health?.services.elevenlabs ?? false} />{!health && <span className="text-xs text-muted-foreground">Backend unreachable — run the API server on port 3001</span>}</div>
      <p className="mt-4 text-center text-xs text-muted-foreground">Before starting, allow camera access for signing and microphone access for captions.</p>
      <p className="mt-auto pt-6 text-center text-xs text-muted-foreground">Sign recognition is limited and developing. Not a substitute for a qualified interpreter, especially in medical, legal, or emergency situations.</p>
    </Shell>
  );
}
