import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight, Camera, CheckCircle2, MessageCircle, Mic, Volume2 } from 'lucide-react'
import { Shell } from '@/components/sora-ui'

export const Route = createFileRoute('/how-it-works')({
  head: () => ({ meta: [{ title: 'How Sora Works — Sora' }, { name: 'description', content: 'Learn how Sora supports two-way conversations.' }] }),
  component: HowItWorks,
})

const steps = [
  { Icon: Camera, title: 'Sign in front of the camera', text: 'Sora tracks body and hand landmarks locally and proposes isolated sign words. No video is sent to the server.' },
  { Icon: MessageCircle, title: 'Review the meaning', text: 'Recognized signs become a sentence. Gemini turns those sign words into a short English interpretation for the signer to check and correct.' },
  { Icon: Volume2, title: 'Confirm, then speak', text: 'After confirmation, ElevenLabs turns the approved sentence into speech. You stay in control of what is said aloud.' },
  { Icon: Mic, title: 'Hear the other person', text: 'When listening is on, ElevenLabs Scribe turns the hearing person’s speech into readable live captions.' },
]

function HowItWorks() {
  return <Shell title="How Sora Works"><div className="mt-5"><div className="rounded-3xl bg-grad-slate p-6 shadow-soft"><p className="text-sm font-semibold text-teal-strong">Two people. One clearer conversation.</p><h2 className="mt-2 font-display text-2xl font-semibold">Sora keeps both sides visible.</h2><p className="mt-3 text-sm text-muted-foreground">Sign, review, speak — or listen and read. Every step is shown on screen.</p></div><div className="mt-5 space-y-3">{steps.map(({ Icon, title, text }, i) => <article key={title} className="flex gap-4 rounded-2xl border border-border bg-card p-4 shadow-soft"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary"><Icon className="h-5 w-5" aria-hidden /></div><div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Step {i + 1}</p><h3 className="mt-1 font-display font-semibold">{title}</h3><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p></div></article>)}</div><section className="mt-5 rounded-3xl border border-warning/30 bg-warning-soft/30 p-5"><h2 className="font-display font-semibold">Important limitation</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Sora’s current recognizer works with supported isolated signs and phrases. It is not unrestricted continuous ASL translation and should not replace a qualified interpreter in medical, legal, emergency, or other high-stakes situations.</p></section><Link to="/conversation" className="focus-ring mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 font-semibold text-primary-foreground shadow-soft">Start a conversation <ArrowRight className="h-4 w-4" aria-hidden /></Link></div></Shell>
}

