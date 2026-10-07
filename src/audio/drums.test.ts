import { expect, it } from 'vitest'
import { DRUM_DEFAULTS, renderDrum, type DrumKind } from './drums'

it('renders every drum type as finite, normalized, non-silent audio', () => {
  for (const kind of Object.keys(DRUM_DEFAULTS) as DrumKind[]) {
    const data = renderDrum(kind, DRUM_DEFAULTS[kind], 44100)
    expect(data.length).toBeGreaterThan(44100 * 0.05)
    let peak = 0
    for (const value of data) {
      expect(Number.isFinite(value)).toBe(true)
      peak = Math.max(peak, Math.abs(value))
    }
    expect(peak).toBeGreaterThan(0.5)
    expect(peak).toBeLessThanOrEqual(0.9)
    expect(Math.abs(data[data.length - 1])).toBeLessThan(0.01)
  }
})

it('longer decay makes a longer kick, and is deterministic', () => {
  const short = renderDrum('kick', { ...DRUM_DEFAULTS.kick, decay: 0.1 })
  const long = renderDrum('kick', { ...DRUM_DEFAULTS.kick, decay: 0.8 })
  expect(long.length).toBeGreaterThan(short.length)
  expect(renderDrum('snare', DRUM_DEFAULTS.snare)).toEqual(renderDrum('snare', DRUM_DEFAULTS.snare))
})
