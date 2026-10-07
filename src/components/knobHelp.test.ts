import { expect, it } from 'vitest'
import { knobHelp } from './knobHelp'

/** Every <Range label="..."> in the components must have tooltip text. */
it('has a technical and a plain-language tooltip for every knob', () => {
  const sources = import.meta.glob('./*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<
    string,
    string
  >
  const missing: string[] = []
  let knobs = 0
  for (const [file, source] of Object.entries(sources)) {
    for (const match of source.matchAll(/<Range\s+label="([^"]+)"(?:\s+context="([^"]+)")?/g)) {
      knobs++
      const help = knobHelp(match[1], match[2])
      if (!help?.tech || !help.plain) missing.push(`${file}: ${match[1]}${match[2] ? ` (${match[2]})` : ''}`)
    }
  }
  expect(knobs).toBeGreaterThan(60)
  expect(missing).toEqual([])
})

it('prefers the contextual entry', () => {
  expect(knobHelp('Attack', 'compressor')?.plain).toMatch(/punchy/)
  expect(knobHelp('Attack')?.plain).toMatch(/fades in/)
  expect(knobHelp('Pitch', 'drum')?.plain).toMatch(/boom/)
})
