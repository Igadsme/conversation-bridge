import { useEffect, useState, type ReactNode } from 'react'
import Recognizer from './recognizer'
import Recorder from './recorder'
import Captions from './captions'
import Conversation from './conversation'
import { getServiceHealth, type ServiceHealth } from './services'

type Route = '/' | '/sign' | '/captions' | '/conversation' | '/record'

const pages: Array<{ path: Route; icon: string; title: string; description: string; className: string }> = [
  { path: '/sign', icon: '✋', title: 'Sign to Speech', description: "Show your signs, review the message, and we'll speak it", className: 'violet' },
  { path: '/captions', icon: '●', title: 'Speech to Text', description: 'Turn spoken replies into large live captions', className: 'teal' },
  { path: '/conversation', icon: '↔', title: 'Conversation Mode', description: 'Use signing and captions together in real time', className: 'slate' },
]

function currentRoute(): Route {
  const path = window.location.pathname
  return ['/', '/sign', '/captions', '/conversation', '/record'].includes(path) ? path as Route : '/'
}

function navigate(path: Route) {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function Logo() {
  return (
    <svg className="sora-mark" viewBox="0 0 64 40" aria-hidden>
      <path d="M6 14c8-8 16-8 26 0s18 8 26 0" />
      <path d="M6 28c8-8 16-8 26 0s18 8 26 0" />
    </svg>
  )
}

function Privacy() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="icon-button" aria-label="Privacy and scope" onClick={() => setOpen(true)}>◇</button>
      {open && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <section className="privacy-modal" role="dialog" aria-modal="true" aria-labelledby="privacy-title" onMouseDown={(event) => event.stopPropagation()}>
            <h2 id="privacy-title">Privacy & scope</h2>
            <ul>
              <li>Camera video stays in this browser. Recognition models process landmarks locally.</li>
              <li>Only the sign words you finish are sent to Gemini for translation.</li>
              <li>Only signer-approved English is sent to ElevenLabs for speech.</li>
              <li>Microphone audio goes to ElevenLabs only while live captions are active.</li>
              <li>This limited prototype is not an interpreter and must not be relied on for medical, legal, or emergency communication.</li>
            </ul>
            <button className="primary-button" onClick={() => setOpen(false)}>Got it</button>
          </section>
        </div>
      )}
    </>
  )
}

function Home({ health }: { health: ServiceHealth | null }) {
  return (
    <div className="home-page">
      <div className="home-topbar">
        <span className="prototype-pill">Prototype</span>
        <Privacy />
      </div>
      <header className="hero">
        <Logo />
        <h1>Sora</h1>
        <p>Bridging conversations for a more inclusive world.</p>
      </header>
      <nav className="mode-cards" aria-label="Communication modes">
        {pages.map((page) => (
          <button key={page.path} className={`mode-card ${page.className}`} onClick={() => navigate(page.path)}>
            <span className="mode-icon" aria-hidden>{page.icon}</span>
            <span><strong>{page.title}</strong><small>{page.description}</small></span>
            <span aria-hidden>›</span>
          </button>
        ))}
      </nav>
      <button className="training-link" onClick={() => navigate('/record')}>Personal training & model calibration</button>
      <div className="service-status" aria-live="polite">
        <span className={health?.services.gemini ? 'online' : ''}>Gemini {health?.services.gemini ? 'ready' : 'not configured'}</span>
        <span className={health?.services.elevenlabs ? 'online' : ''}>ElevenLabs {health?.services.elevenlabs ? 'ready' : 'not configured'}</span>
      </div>
      <p className="scope-note">Sign recognition is limited and developing. Review every message before it is spoken.</p>
    </div>
  )
}

function PageShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="app-page">
      <header className="page-header">
        <button className="back-button" onClick={() => navigate('/')} aria-label="Back to home">‹</button>
        <div><Logo /><h1>{title}</h1></div>
        <Privacy />
      </header>
      {children}
    </div>
  )
}

export default function App() {
  const [route, setRoute] = useState<Route>(currentRoute)
  const [health, setHealth] = useState<ServiceHealth | null>(null)

  useEffect(() => {
    const update = () => setRoute(currentRoute())
    window.addEventListener('popstate', update)
    getServiceHealth().then(setHealth).catch(() => setHealth(null))
    return () => window.removeEventListener('popstate', update)
  }, [])

  if (route === '/') return <Home health={health} />
  if (route === '/sign') return <PageShell title="Sign to Speech"><Recognizer /></PageShell>
  if (route === '/captions') return <PageShell title="Speech to Text"><Captions /></PageShell>
  if (route === '/conversation') return <PageShell title="Conversation Mode"><Conversation /></PageShell>
  return <PageShell title="Personal Training"><Recorder /></PageShell>
}
