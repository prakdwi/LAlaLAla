import { expect, it } from 'vitest'
import {
  applyGroove,
  bassNotes,
  chordsFromNotes,
  densityHits,
  euclid,
  fillHits,
  hitsToSteps,
  humanize,
  melodyNotes,
  presetHits,
  roleFromName,
} from './generate'
import { inScale } from './scale'
import type { MusicalKey, Step } from './types'

const key: MusicalKey = { root: 0, scale: 'minor' }
const empty = (count: number): Step[] =>
  Array.from({ length: count }, () => ({ active: false, velocity: 1, microTimingMs: 0 }))

it('spreads Euclidean pulses evenly and rotates them', () => {
  expect(euclid(8, 3)).toEqual([0, 3, 6])
  expect(euclid(16, 4)).toEqual([0, 4, 8, 12])
  expect(euclid(16, 5)).toEqual([0, 4, 7, 10, 13])
  expect(euclid(8, 3, 1)).toEqual([1, 4, 7])
  expect(euclid(8, 0)).toEqual([])
  expect(euclid(4, 9)).toEqual([0, 1, 2, 3])
})

it('presets repeat per bar and density draws are reproducible and bounded', () => {
  const hits = presetHits('house', 'kick', 2)
  expect(hits.map(hit => hit.step)).toEqual([0, 4, 8, 12, 16, 20, 24, 28])
  const a = densityHits('hat', 0.5, 1, 7)
  const b = densityHits('hat', 0.5, 1, 7)
  expect(a).toEqual(b)
  expect(a.length).toBe(Math.round(0.5 * 16 * 0.9))
  expect(densityHits('kick', 1, 1, 3).length).toBe(8)
  expect(densityHits('kick', 0, 1, 3)).toEqual([])
  expect(densityHits('kick', 0.3, 1, 3)[0].step).toBe(0)
})

it('fills the end of the pattern and writes hits into a step row for one pad', () => {
  const filled = fillHits(presetHits('house', 'snare', 1), 'snare', 1)
  expect(filled.filter(hit => hit.step >= 12).map(hit => hit.step)).toEqual([12, 13, 14, 15])
  expect(filled.some(hit => hit.step === 4)).toBe(true)
  const steps = hitsToSteps(
    [
      { step: 0, velocity: 0.9 },
      { step: 6, velocity: 0.5 },
    ],
    empty(16),
    'padA',
  )
  expect(steps.filter(step => step.active).map(step => [step.padId, step.velocity])).toEqual([
    ['padA', 0.9],
    ['padA', 0.5],
  ])
  const other: Step[] = empty(16)
  other[2] = { active: true, velocity: 1, microTimingMs: 0, padId: 'padB' }
  const merged = hitsToSteps([{ step: 0, velocity: 1 }], other, 'padA')
  expect(merged[2].padId).toBe('padB')
  expect(merged[0].padId).toBe('padA')
})

it('grooves and humanize stay inside the step limits and are deterministic', () => {
  const steps = empty(16).map((step, index) => ({ ...step, active: index % 2 === 0, velocity: 0.9 }))
  const grooved = applyGroove(steps, 'dilla')
  expect(grooved[4].microTimingMs).toBe(18)
  expect(grooved[1].active).toBe(false)
  expect(grooved.every(step => step.microTimingMs >= -50 && step.microTimingMs <= 50)).toBe(true)
  const h1 = humanize(steps, 1, 5)
  const h2 = humanize(steps, 1, 5)
  expect(h1).toEqual(h2)
  expect(h1.some(step => step.microTimingMs !== 0)).toBe(true)
  expect(h1.every(step => step.velocity >= 0.05 && step.velocity <= 1)).toBe(true)
  expect(humanize(steps, 0, 5)).toEqual(steps)
})

it('melodies stay in key and in range, bass follows chord roots and kicks', () => {
  const chords = chordsFromNotes([
    { id: 'a', pitch: 60, start: 0, length: 4, velocity: 1 },
    { id: 'b', pitch: 63, start: 0, length: 4, velocity: 1 },
    { id: 'c', pitch: 67, start: 0, length: 4, velocity: 1 },
    { id: 'd', pitch: 65, start: 4, length: 4, velocity: 1 },
    { id: 'e', pitch: 68, start: 4, length: 4, velocity: 1 },
    { id: 'f', pitch: 72, start: 4, length: 4, velocity: 1 },
    { id: 'g', pitch: 80, start: 6, length: 1, velocity: 1 },
  ])
  expect(chords.map(chord => chord.pitches)).toEqual([
    [60, 63, 67],
    [65, 68, 72],
  ])
  const melody = melodyNotes(key, chords, { totalBeats: 8, density: 0.8, centre: 72, seed: 3 })
  expect(melody.length).toBeGreaterThan(6)
  expect(melody.every(note => inScale(key, note.pitch))).toBe(true)
  expect(melody.every(note => note.pitch >= 65 && note.pitch <= 79)).toBe(true)
  expect(melody.every(note => note.start + note.length <= 8.01)).toBe(true)
  expect(melodyNotes(key, chords, { totalBeats: 8, seed: 3 })).toEqual(
    melodyNotes(key, chords, { totalBeats: 8, seed: 3 }).map(note => ({ ...note, id: expect.any(String) })),
  )
  const bass = bassNotes(key, chords, { totalBeats: 8, kickBeats: [0, 1.5, 2.5, 4, 5.5, 6.5] })
  expect(bass.map(note => note.start)).toEqual([0, 1.5, 2.5, 4, 5.5, 6.5])
  expect(bass[0].pitch % 12).toBe(0)
  expect(bass[3].pitch % 12).toBe(5)
  expect(bass.every(note => note.pitch < 48)).toBe(true)
  expect(roleFromName('Open hat')).toBe('hat')
  expect(roleFromName('808 kick')).toBe('kick')
  expect(roleFromName('Clap')).toBe('snare')
  expect(roleFromName('Conga')).toBe('perc')
})
