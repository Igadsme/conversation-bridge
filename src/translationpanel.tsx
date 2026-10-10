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

type Props = {
  signs: string[]
  onApprove?: (sentence: string) => void // step D will speak it
}

export default function TranslationPanel({ signs, onApprove }: Props) {
  const [question, setQuestion] = useState(false)
  const [translation, setTranslation] = useState<Translation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [chosen, setChosen] = useState(0) // 0 = sentence, 1+ = alternatives
  const [approved, setApproved] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0) // bump to try again

  // Ask Gemini whenever the question toggle changes or "Try again" is pressed.
  // (The parent remounts this panel with a new key when the signs change.)
  const key = signs.join(' ')
  useEffect(() => {
    let cancelled = false
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

  if (approved) {
    return (
      <div className="translation">
        <p className="translation-approved">“{approved}”</p>
        <p className="sentence-note">Approved. Speaking it aloud comes in the next step.</p>
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
