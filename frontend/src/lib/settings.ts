export type CaptionSize = 'S' | 'M' | 'L'

export type SoraSettings = {
  captionSize: CaptionSize
  highContrast: boolean
  speechRate: number
  confirmTranslations: boolean
}

export const DEFAULT_SETTINGS: SoraSettings = {
  captionSize: 'L',
  highContrast: false,
  speechRate: 1,
  confirmTranslations: true,
}

const KEY = 'sora-settings'
const EVENT = 'sora-settings-changed'

export function loadSettings(): SoraSettings {
  if (typeof localStorage === 'undefined') return DEFAULT_SETTINGS
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<SoraSettings>
    return {
      captionSize: saved.captionSize === 'S' || saved.captionSize === 'M' || saved.captionSize === 'L' ? saved.captionSize : DEFAULT_SETTINGS.captionSize,
      highContrast: saved.highContrast === true,
      speechRate: typeof saved.speechRate === 'number' && saved.speechRate >= 0.75 && saved.speechRate <= 1.25 ? saved.speechRate : DEFAULT_SETTINGS.speechRate,
      confirmTranslations: saved.confirmTranslations !== false,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings: SoraSettings) {
  localStorage.setItem(KEY, JSON.stringify(settings))
  applySettings(settings)
  window.dispatchEvent(new CustomEvent(EVENT, { detail: settings }))
}

export function applySettings(settings: SoraSettings) {
  document.documentElement.dataset.contrast = settings.highContrast ? 'high' : 'normal'
  document.documentElement.dataset.captionSize = settings.captionSize
}

export const SETTINGS_EVENT = EVENT

