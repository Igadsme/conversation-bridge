import { useEffect, useRef, useState } from 'react'
import { useScribe } from '@elevenlabs/react'
import { getScribeToken } from './services'

type Props = {
  compact?: boolean
  onCommitted?: (text: string) => void
}

export default function Captions({ compact = false, onCommitted }: Props) {
  const [size, setSize] = useState<'small' | 'medium' | 'large'>('large')
  const [lines, setLines] = useState<string[]>([])
  const [localError, setLocalError] = useState<string | null>(null)
  const callbackRef = useRef(onCommitted)
  callbackRef.current = onCommitted

  const scribe = useScribe({
    modelId: 'scribe_v2_realtime',
    onCommittedTranscript: ({ text }) => {
      const clean = text.trim()
      if (!clean) return
      setLines((current) => [...current, clean])
      callbackRef.current?.(clean)
    },
    onError: (error) => setLocalError(error instanceof Error ? error.message : 'Live captions disconnected'),
  })

  useEffect(() => () => scribe.disconnect(), [])

  async function toggle() {
    setLocalError(null)
    if (scribe.isConnected) {
      scribe.disconnect()
      return
    }
    try {
      const token = await getScribeToken()
      await scribe.connect({
        token,
        microphone: { echoCancellation: true, noiseSuppression: true },
      })
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Could not start live captions')
    }
  }

  const active = scribe.status === 'connecting' || scribe.isConnected
  const current = scribe.partialTranscript || lines.at(-1) || ''

  return (
    <section className={`captions-panel ${compact ? 'compact' : ''}`}>
      <div className="listening-orb" data-active={active} aria-hidden>
        <span>●</span>
      </div>
      <p className="eyebrow" role="status">
        {scribe.status === 'connecting' ? 'Connecting…' : scribe.isConnected ? 'Listening…' : 'Captions paused'}
      </p>

      <div className={`caption-display caption-${size}`} aria-live="polite">
        <span>{current || 'Speech will appear here.'}</span>
        {scribe.partialTranscript && <span className="caption-caret">▍</span>}
      </div>

      {!compact && lines.length > 1 && (
        <ol className="caption-history">
          {lines.slice(0, -1).slice(-3).map((line, index) => <li key={`${index}-${line}`}>{line}</li>)}
        </ol>
      )}

      {(localError || scribe.error) && <p className="inline-error">{localError || scribe.error}</p>}

      <div className="caption-controls">
        {!compact && (
          <div className="size-switch" aria-label="Caption text size">
            {(['small', 'medium', 'large'] as const).map((value) => (
              <button key={value} aria-pressed={size === value} onClick={() => setSize(value)}>
                {value[0].toUpperCase()}
              </button>
            ))}
          </div>
        )}
        <button className={`mic-button ${scribe.isConnected ? 'stop' : ''}`} onClick={toggle} disabled={scribe.status === 'connecting'}>
          {scribe.isConnected ? '■ Stop' : '● Start listening'}
        </button>
        {!compact && lines.length > 0 && <button className="text-button" onClick={() => setLines([])}>Clear</button>}
      </div>
    </section>
  )
}
