// SENTENCE B + C - Show the English for a finished sentence and let the signer
// choose it. Nothing is spoken until they press Approve (speaking is step D).
//
// - The signs are shown above the English, so the signer sees what was understood
// - The best sentence is selected; the alternatives can be picked instead
// - "Question" re-asks Gemini to phrase it as a question (ASL marks questions
//   with raised eyebrows, which our models don't read)
// - "Unclear" from Gemini is shown as a warning

import { useEffect, useState } from 'react'
import { translate, type Translation } from './translate'
import { startSpeech, type SpeechPlayback } from './lib/relay-services'
import { loadSettings } from './lib/settings'

type Props = {
  signs: string[]
  onApprove?: ((sentence: string) => void) | undefined // step D will speak it
}

export default function TranslationPanel({ signs, onApprove }: Props) {
  const [question, setQuestion] = useState(false)
  const [translation, setTranslation] = useState<Translation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [chosen, setChosen] = useState(0) // 0 = sentence, 1+ = alternatives
  const [approved, setApproved] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0) // bump to try again
  const [speechState, setSpeechState] = useState<'idle' | 'loading' | 'playing' | 'done'>('idle')
  const [speechError, setSpeechError] = useState<string | null>(null)
  const [playback, setPlayback] = useState<SpeechPlayback | null>(null)

  // Ask Gemini whenever the question toggle changes or "Try again" is pressed.
  // (The parent remounts this panel with a new key when the signs change.)
  const key = signs.join(' ')
  useEffect(() => {
    let cancelled = false
    setTranslation(null)
    setError(null)
    setChosen(0)
    translate(key.split(' '), question)
      .then((t) => !cancelled && setTranslation(t))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)))
    return () => {
      cancelled = true
    }
  }, [key, question, attempt])

  const options = translation ? [translation.sentence, ...translation.alternatives] : []

  function approve() {
    const sentence = options[chosen]
    setApproved(sentence)
    onApprove?.(sentence)
  }

  useEffect(() => () => playback?.stop(), [playback])

  async function speak() {
    if (!approved) return
    if (speechState === 'playing' && playback) {
      playback.stop()
      setPlayback(null)
      setSpeechState('idle')
      return
    }
    setSpeechError(null)
    setSpeechState('loading')
    try {
      const next = await startSpeech(approved, loadSettings().speechRate)
      setPlayback(next)
      setSpeechState('playing')
      await next.finished
      setPlayback(null)
      setSpeechState('done')
    } catch (err) {
      setPlayback(null)
      setSpeechState('idle')
      setSpeechError(err instanceof Error ? err.message : 'Could not play speech')
    }
  }

  if (approved) {
    return (
      <div className="translation">
        <p className="translation-approved">“{approved}”</p>
        <p className="sentence-note">Approved by the signer. Nothing is spoken until you press the button.</p>
        <button className="speak-button" onClick={speak} disabled={speechState === 'loading'}>
          {speechState === 'loading'
            ? 'Generating speech…'
            : speechState === 'playing'
              ? '■ Stop speaking'
              : speechState === 'done'
                ? '↻ Speak again'
                : '▶ Speak aloud'}
        </button>
        {speechError && <p className="translation-error">{speechError}</p>}
      </div>
    )
  }

  return (
    <div className="translation">
      <label className="translation-question">
        <input
          type="checkbox"
          checked={question}
          onChange={(e) => {
            setQuestion(e.target.checked)
            setTranslation(null) // show "Turning your signs into English…" until the new answer
            setError(null)
            setChosen(0)
          }}
        />{' '}
        It's a question
      </label>

      {error && (
        <p className="translation-error">
          {error}{' '}
          <button
            onClick={() => {
              setError(null)
              setAttempt((n) => n + 1)
            }}
          >
            Try again
          </button>
        </p>
      )}
      {!error && !translation && <p className="sentence-note">Turning your signs into English…</p>}

      {translation && (
        <>
          {translation.unclear && (
            <p className="translation-warning">These signs don't clearly make a sentence. Check carefully, or edit the signs.</p>
          )}
          <div className="translation-options" role="radiogroup" aria-label="English sentence">
            {options.map((option, i) => (
              <button
                key={option}
                role="radio"
                aria-checked={chosen === i}
                className={chosen === i ? 'chosen' : ''}
                onClick={() => setChosen(i)}
              >
                {option}
              </button>
            ))}
          </div>
          <div className="sentence-actions">
            <button className="sentence-done-button" onClick={approve}>
              Approve
            </button>
          </div>
        </>
      )}
    </div>
  )
}
