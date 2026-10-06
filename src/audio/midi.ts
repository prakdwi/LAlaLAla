/**
 * Web MIDI input. Note on/off and CC messages from every connected input are forwarded to one
 * listener; the UI decides which track they play.
 */
export type MidiMessage =
  | { type: 'noteon'; pitch: number; velocity: number; channel: number }
  | { type: 'noteoff'; pitch: number; channel: number }
  | { type: 'cc'; controller: number; value: number; channel: number }

type Listener = (message: MidiMessage, input: string) => void

class MidiInput {
  private access?: MIDIAccess
  private listeners = new Set<Listener>()
  inputs: { id: string; name: string }[] = []
  status: 'idle' | 'unsupported' | 'denied' | 'ready' = 'idle'
  onChange?: () => void

  get supported() {
    return typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator
  }
  async enable() {
    if (!this.supported) {
      this.status = 'unsupported'
      this.onChange?.()
      return false
    }
    if (this.access) return true
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false })
      this.access.onstatechange = () => this.refresh()
      this.refresh()
      this.status = 'ready'
    } catch {
      this.status = 'denied'
    }
    this.onChange?.()
    return this.status === 'ready'
  }
  private refresh() {
    if (!this.access) return
    this.inputs = []
    for (const input of this.access.inputs.values()) {
      this.inputs.push({ id: input.id, name: input.name ?? 'MIDI input' })
      input.onmidimessage = event => this.handle(event, input.name ?? input.id)
    }
    this.onChange?.()
  }
  private handle(event: MIDIMessageEvent, name: string) {
    const data = event.data
    if (!data || data.length < 2) return
    const status = data[0] & 0xf0
    const channel = data[0] & 0x0f
    if (status === 0x90 && data[2] > 0)
      this.emit({ type: 'noteon', pitch: data[1], velocity: data[2] / 127, channel }, name)
    else if (status === 0x80 || (status === 0x90 && data[2] === 0))
      this.emit({ type: 'noteoff', pitch: data[1], channel }, name)
    else if (status === 0xb0) this.emit({ type: 'cc', controller: data[1], value: data[2] / 127, channel }, name)
  }
  private emit(message: MidiMessage, input: string) {
    for (const listener of this.listeners) listener(message, input)
  }
  subscribe(listener: Listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

export const midi = new MidiInput()

/** Computer keyboard as a two-octave piano: lower row is the white keys from C, number row sharps. */
export const PIANO_KEYS: Record<string, number> = {
  a: 0,
  w: 1,
  s: 2,
  e: 3,
  d: 4,
  f: 5,
  t: 6,
  g: 7,
  y: 8,
  h: 9,
  u: 10,
  j: 11,
  k: 12,
  o: 13,
  l: 14,
  p: 15,
  ';': 16,
  "'": 17,
}
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const noteName = (pitch: number) => `${NOTE_NAMES[((pitch % 12) + 12) % 12]}${Math.floor(pitch / 12) - 1}`
export const isBlackKey = (pitch: number) => [1, 3, 6, 8, 10].includes(((pitch % 12) + 12) % 12)
