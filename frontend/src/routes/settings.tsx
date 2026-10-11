import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Check, Contrast, RotateCcw, Settings as SettingsIcon, Trash2 } from 'lucide-react'
import { Shell } from '@/components/sora-ui'
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type CaptionSize, type SoraSettings } from '@/lib/settings'

export const Route = createFileRoute('/settings')({
  head: () => ({ meta: [{ title: 'Sora — Bridging Conversations' }, { name: 'description', content: 'Personalize Sora for your conversation.' }] }),
  component: Settings,
})

function Settings() {
  const [settings, setSettings] = useState<SoraSettings>(loadSettings)
  const update = (next: Partial<SoraSettings>) => {
    const value = { ...settings, ...next }
    setSettings(value)
    saveSettings(value)
  }

  return (
    <Shell title="Settings">
      <div className="mt-5 space-y-4">
        <section className="rounded-3xl border border-border bg-card p-5 shadow-soft">
          <div className="flex items-start gap-3"><SettingsIcon className="mt-0.5 h-5 w-5 text-teal-strong" aria-hidden /><div><h2 className="font-display font-semibold">Conversation preferences</h2><p className="mt-1 text-sm text-muted-foreground">Choose how Sora presents and speaks messages.</p></div></div>
          <label className="mt-5 flex items-center justify-between gap-4"><span><span className="block font-medium">Confirm translations</span><span className="text-sm text-muted-foreground">Review an interpretation before Sora speaks it.</span></span><input className="h-5 w-5 accent-primary" type="checkbox" checked={settings.confirmTranslations} onChange={(e) => update({ confirmTranslations: e.target.checked })} /></label>
          <div className="mt-5"><span className="font-medium">Caption text size</span><div className="mt-2 grid grid-cols-3 gap-2" role="group" aria-label="Caption text size">{(['S', 'M', 'L'] as CaptionSize[]).map((size) => <button key={size} type="button" aria-pressed={settings.captionSize === size} onClick={() => update({ captionSize: size })} className={`focus-ring rounded-xl border px-3 py-2 text-sm ${settings.captionSize === size ? 'border-primary bg-primary/15 text-foreground' : 'border-border bg-muted text-muted-foreground'}`}>{size === 'S' ? 'Small' : size === 'M' ? 'Medium' : 'Large'}</button>)}</div></div>
          <div className="mt-5"><label htmlFor="speech-rate" className="font-medium">Speech playback speed <span className="text-muted-foreground">{settings.speechRate.toFixed(2)}×</span></label><input id="speech-rate" className="mt-2 w-full accent-primary" type="range" min="0.75" max="1.25" step="0.05" value={settings.speechRate} onChange={(e) => update({ speechRate: Number(e.target.value) })} /></div>
        </section>
        <section className="rounded-3xl border border-border bg-card p-5 shadow-soft">
          <div className="flex items-start gap-3"><Contrast className="mt-0.5 h-5 w-5 text-teal-strong" aria-hidden /><div><h2 className="font-display font-semibold">Accessibility</h2><p className="mt-1 text-sm text-muted-foreground">Increase contrast for easier reading.</p></div></div>
          <label className="mt-5 flex items-center justify-between gap-4"><span><span className="block font-medium">High contrast</span><span className="text-sm text-muted-foreground">Use stronger borders and text contrast.</span></span><input className="h-5 w-5 accent-primary" type="checkbox" checked={settings.highContrast} onChange={(e) => update({ highContrast: e.target.checked })} /></label>
        </section>
        <section className="rounded-3xl border border-border bg-card p-5 shadow-soft"><h2 className="font-display font-semibold">This session</h2><p className="mt-1 text-sm text-muted-foreground">Clear the conversation transcript stored in this tab.</p><button type="button" onClick={() => { sessionStorage.removeItem('sora-transcript'); window.dispatchEvent(new Event('sora-clear-transcript')) }} className="focus-ring mt-4 inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"><Trash2 className="h-4 w-4" aria-hidden />Clear transcript</button></section>
        <button type="button" onClick={() => { setSettings(DEFAULT_SETTINGS); saveSettings(DEFAULT_SETTINGS) }} className="focus-ring inline-flex items-center gap-2 text-sm font-semibold text-primary underline underline-offset-4"><RotateCcw className="h-4 w-4" aria-hidden />Reset preferences</button>
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><Check className="h-4 w-4 text-teal-strong" aria-hidden />Changes are saved on this device.</p>
      </div>
    </Shell>
  )
}

