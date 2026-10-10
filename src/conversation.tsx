import { useRef, useState, type FormEvent } from 'react'
import Captions from './captions'
import Recognizer from './recognizer'
import { startSpeech } from './services'

type Message = { id: number; who: 'signer' | 'speaker'; text: string; at: Date; typed?: boolean }

export default function Conversation() {
  const [messages, setMessages] = useState<Message[]>([])
  const [view, setView] = useState<'sign' | 'listen'>('sign')
  const [typed, setTyped] = useState('')
  const [speaking, setSpeaking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = useRef(1)

  function add(who: Message['who'], text: string, typedMessage = false) {
    setMessages((current) => [...current, { id: id.current++, who, text, at: new Date(), typed: typedMessage }])
  }

  async function submitTyped(event: FormEvent) {
    event.preventDefault()
    const text = typed.trim()
    if (!text || speaking) return
    setSpeaking(true)
    setError(null)
    try {
      const playback = await startSpeech(text)
      add('signer', text, true)
      setTyped('')
      await playback.finished
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not speak the message')
    } finally {
      setSpeaking(false)
    }
  }

  return (
    <div className="conversation-layout">
      <section className="conversation-history" aria-label="Conversation history" aria-live="polite">
        <div className="conversation-heading">
          <div><span className="eyebrow">This conversation</span><h2>Recent messages</h2></div>
          {messages.length > 0 && <button className="text-button" onClick={() => setMessages([])}>Clear</button>}
        </div>
        {messages.length === 0 ? (
          <p className="conversation-empty">Signed and spoken messages will appear here. Nothing is saved after the page closes.</p>
        ) : messages.map((message) => (
          <article key={message.id} className={`message ${message.who}`}>
            <span>{message.who === 'signer' ? message.typed ? 'Signer · typed' : 'Signer · signed' : 'Hearing person · speech'}</span>
            <p>{message.text}</p>
            <time>{message.at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>
          </article>
        ))}
      </section>

      <div className="conversation-switch" role="tablist">
        <button role="tab" aria-selected={view === 'sign'} onClick={() => setView('sign')}>✋ Sign a reply</button>
        <button role="tab" aria-selected={view === 'listen'} onClick={() => setView('listen')}>● Listen</button>
      </div>

      {view === 'sign' ? (
        <div className="conversation-tool">
          <form className="typed-message" onSubmit={submitTyped}>
            <label htmlFor="typed-message">Type instead</label>
            <div><input id="typed-message" value={typed} onChange={(event) => setTyped(event.target.value)} placeholder="Type a message to speak…" /><button disabled={!typed.trim() || speaking}>{speaking ? 'Speaking…' : 'Speak'}</button></div>
            {error && <p className="inline-error">{error}</p>}
          </form>
          <Recognizer onApprovedSentence={(sentence) => add('signer', sentence)} />
        </div>
      ) : (
        <Captions compact onCommitted={(text) => add('speaker', text)} />
      )}
    </div>
  )
}
