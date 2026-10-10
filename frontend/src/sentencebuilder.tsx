// SENTENCE A - Sentence builder: collect recognized signs into a sentence the
// signer can check and fix BEFORE anything is translated or spoken.
//
// - Each recognized sign becomes a chip: [COFFEE] [HOT] [LARGE] [PLEASE]
// - Tap a chip to swap it for one of the other guesses for that sign, or remove it
// - Tap any guess in the model cards to add it yourself (e.g. after "not sure")
// - Done (or Enter) finishes the sentence; Backspace removes the last sign
//
// The finished sentence is a list of sign names (ASL gloss). After Done,
// TranslationPanel (SENTENCE B + C) turns it into English for the signer to approve.

import { useEffect, useState } from 'react'
import TranslationPanel from './translationpanel'
import './sentencebuilder.css'

export type Chip = {
  id: number
  sign: string // our name, e.g. "COFFEE"
  alternatives: string[] // other guesses for the same sign, best first
  from: string // which model's answer it was, e.g. "Personal"
}

type Props = {
  chips: Chip[]
  done: boolean
  onSwap: (id: number, sign: string) => void
  onRemove: (id: number) => void
  onClear: () => void
  onDone: () => void
  onEdit: () => void
  onApproved?: ((sentence: string) => void) | undefined
}

export default function SentenceBuilder({ chips, done, onSwap, onRemove, onClear, onDone, onEdit, onApproved }: Props) {
  // The chip whose alternatives are open, if any
  const [openId, setOpenId] = useState<number | null>(null)
  const open = chips.find((c) => c.id === openId)

  // Keyboard: Enter = Done, Backspace = remove the last sign
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select')) return
      if (e.key === 'Enter' && !done && chips.length > 0) {
        e.preventDefault()
        onDone()
      } else if (e.key === 'Backspace' && !done && chips.length > 0) {
        e.preventDefault()
        onRemove(chips[chips.length - 1].id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (done) {
    return (
      <section className="sentence sentence-done" aria-live="polite">
        <h2>Your sentence</h2>
        <p className="sentence-gloss">{chips.map((c) => c.sign).join(' ')}</p>
        {/* key: a different sentence gets a fresh panel */}
        <TranslationPanel key={chips.map((c) => c.sign).join(' ')} signs={chips.map((c) => c.sign)} onApprove={onApproved} />
        <div className="sentence-actions">
          <button onClick={onEdit}>Edit</button>
          <button onClick={onClear}>New sentence</button>
        </div>
      </section>
    )
  }

  return (
    <section className="sentence" aria-label="Sentence builder">
      <div className="sentence-chips">
        {chips.length === 0 ? (
          <span className="sentence-empty">Sign to start a sentence. Each recognized sign appears here.</span>
        ) : (
          chips.map((c) => (
            <span key={c.id} className={`sentence-chip ${c.id === openId ? 'open' : ''}`}>
              <button
                className="sentence-chip-sign"
                onClick={() => setOpenId(c.id === openId ? null : c.id)}
                title={`From ${c.from}. Tap to change.`}
              >
                {c.sign}
              </button>
              <button className="sentence-chip-remove" onClick={() => onRemove(c.id)} aria-label={`Remove ${c.sign}`}>
                ×
              </button>
            </span>
          ))
        )}
      </div>

      {open && (
        <div className="sentence-alternatives">
          <span>Change {open.sign} to:</span>
          {open.alternatives.length === 0 && <span className="sentence-empty">no other guesses</span>}
          {open.alternatives.map((alt) => (
            <button
              key={alt}
              onClick={() => {
                onSwap(open.id, alt)
                setOpenId(null)
              }}
            >
              {alt}
            </button>
          ))}
          <button className="sentence-cancel" onClick={() => setOpenId(null)}>
            Cancel
          </button>
        </div>
      )}

      <div className="sentence-actions">
        <button onClick={() => chips.length && onRemove(chips[chips.length - 1].id)} disabled={chips.length === 0}>
          Undo last (Backspace)
        </button>
        <button onClick={onClear} disabled={chips.length === 0}>
          Clear
        </button>
        <button className="sentence-done-button" onClick={onDone} disabled={chips.length === 0}>
          Done (Enter)
        </button>
      </div>
    </section>
  )
}
