/**
 * Browser capability check, run once at boot. The app is tested on Chromium; other engines run
 * but lose features, and the header says which instead of failing quietly.
 */
export type Support = {
  browser: 'chromium' | 'firefox' | 'safari' | 'other'
  /** sample-accurate clock and recording */
  audioWorklet: boolean
  /** sampling the backing video through tab-audio share */
  tabAudio: boolean
  webMidi: boolean
  /** microphone and line-in recording */
  mediaDevices: boolean
  /** short list of what is missing, in plain words; empty on a supported browser */
  missing: string[]
}

export function detectSupport(): Support {
  const agent = typeof navigator === 'undefined' ? '' : navigator.userAgent
  const browser: Support['browser'] = /Firefox\//.test(agent)
    ? 'firefox'
    : /Chrome\/|Chromium\/|Edg\//.test(agent)
      ? 'chromium'
      : /Safari\//.test(agent)
        ? 'safari'
        : 'other'
  const audioWorklet = typeof AudioWorkletNode !== 'undefined'
  const mediaDevices = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
  const tabAudio =
    typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getDisplayMedia) && browser === 'chromium'
  const webMidi = typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator
  const missing: string[] = []
  if (!audioWorklet) missing.push('a stable clock when the tab is hidden (no AudioWorklet)')
  if (!mediaDevices) missing.push('microphone recording')
  if (!tabAudio) missing.push('sampling the backing video (tab audio needs Chrome or Edge on desktop)')
  if (!webMidi) missing.push('MIDI controllers (no Web MIDI)')
  return { browser, audioWorklet, tabAudio, webMidi, mediaDevices, missing }
}

export const support = detectSupport()

export const BROWSER_LABEL: Record<Support['browser'], string> = {
  chromium: 'Chrome / Edge',
  firefox: 'Firefox',
  safari: 'Safari',
  other: 'this browser',
}
