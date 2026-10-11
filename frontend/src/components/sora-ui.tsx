import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ChevronLeft, Check, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose,
} from "@/components/ui/dialog";

// `wide`: camera pages use the whole screen of a laptop or tablet on the counter
// `onBack`: a back button that changes state on the same page instead of navigating
export function Shell({ title, back = true, backTo = "/app", onBack, action, wide = false, extraWide = false, children }: { title?: string; back?: boolean; backTo?: string; onBack?: () => void; action?: ReactNode; wide?: boolean; extraWide?: boolean; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background bg-page text-foreground">
      <div className={`mx-auto flex min-h-screen w-full flex-col px-4 pb-6 pt-3 ${extraWide ? "max-w-[1440px]" : wide ? "max-w-6xl" : "max-w-md"}`}>
        {title && (
          <header className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center py-2">
            {back && onBack ? (
              <button type="button" onClick={onBack} aria-label="Back" className="focus-ring grid h-11 w-11 place-items-center rounded-full hover:bg-muted">
                <ChevronLeft className="h-6 w-6" aria-hidden />
              </button>
            ) : back ? (
              <Link to={backTo} aria-label="Back" className="focus-ring grid h-11 w-11 place-items-center rounded-full hover:bg-muted">
                <ChevronLeft className="h-6 w-6" aria-hidden />
              </Link>
            ) : <span />}
            <h1 className="truncate text-center font-display text-lg font-semibold">{title}</h1>
            <div className="flex justify-end">{action}</div>
          </header>
        )}
        {children}
      </div>
    </div>
  );
}

export function SoraMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 40" className={className} aria-hidden fill="none" strokeLinecap="round" strokeWidth="6">
      <path d="M6 14c8-8 16-8 26 0s18 8 26 0" className="stroke-teal-strong" />
      <path d="M6 28c8-8 16-8 26 0s18 8 26 0" className="stroke-lavender-strong" />
    </svg>
  );
}

export function Wave({ bars = 28, active = true, className = "" }: { bars?: number; active?: boolean; className?: string }) {
  return (
    <div aria-hidden className={`flex h-12 items-center gap-[3px] ${className}`}>
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className={`w-1 rounded-full bg-lavender-strong ${active ? "wave-bar" : "opacity-40"}`}
          style={{ height: `${30 + ((i * 37) % 70)}%`, animationDelay: `${(i % 7) * 0.11}s` }}
        />
      ))}
    </div>
  );
}

export function PrototypeNote({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-center text-xs text-muted-foreground">{children}</p>;
}

export function PrivacyDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="focus-ring h-11 w-11 rounded-full" aria-label="Privacy and scope"><ShieldCheck aria-hidden /></Button>
      </DialogTrigger>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Privacy & scope</DialogTitle>
          <DialogDescription>How this prototype works.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-3 text-sm">
          {[
            "Camera video stays in this browser: signs are recognized on this device from body and hand points.",
            "Only the sign words you finish are sent to Gemini to turn them into English.",
            "Only English you approve is sent to ElevenLabs to be spoken. Microphone audio goes to ElevenLabs only while captions are on.",
            "No video or audio is recorded or stored.",
            "Sign interpretations may be incorrect; the signer reviews every message before it is spoken.",
            "This prototype does not provide unrestricted or reliable ASL translation.",
            "Sora is a conversation aid prototype, not a substitute for a qualified interpreter. Do not rely on it for medical, legal, or emergency communication.",
          ].map((t) => (
            <li key={t} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-strong" aria-hidden />{t}</li>
          ))}
        </ul>
        <DialogFooter><DialogClose asChild><Button className="focus-ring h-11">Got it</Button></DialogClose></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
