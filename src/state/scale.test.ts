import { expect, it } from 'vitest'
import {
  chordPitches,
  inScale,
  isKey,
  keyName,
  numeralFor,
  PROGRESSIONS,
  progressionNotes,
  snapToScale,
  stepInScale,
} from './scale'
import type { MusicalKey } from './types'

const cMinor: MusicalKey = { root: 0, scale: 'minor' }
const fMajor: MusicalKey = { root: 5, scale: 'major' }

it('knows which pitches belong to a key', () => {
  expect(inScale(cMinor, 60)).toBe(true) // C
  expect(inScale(cMinor, 63)).toBe(true) // Eb
  expect(inScale(cMinor, 64)).toBe(false) // E
  expect(inScale(fMajor, 70)).toBe(true) // Bb
  expect(inScale(fMajor, 71)).toBe(false) // B
  expect(keyName(fMajor)).toBe('F major')
})

it('snaps out-of-key pitches to the nearest note below, in-key pitches stay', () => {
  expect(snapToScale(cMinor, 64)).toBe(63)
  expect(snapToScale(cMinor, 61)).toBe(60)
  expect(snapToScale(cMinor, 62)).toBe(62)
  expect(snapToScale({ root: 0, scale: 'pentatonicMinor' }, 62)).toBe(63)
  expect(snapToScale({ root: 0, scale: 'pentatonicMinor' }, 61)).toBe(60)
})

it('walks the scale by degrees across octaves', () => {
  expect(stepInScale(cMinor, 60, 2)).toBe(63)
  expect(stepInScale(cMinor, 60, 4)).toBe(67)
  expect(stepInScale(cMinor, 60, 7)).toBe(72)
  expect(stepInScale(cMinor, 60, -1)).toBe(58)
  expect(stepInScale(cMinor, 67, 3)).toBe(72)
})

it('builds diatonic chords and names them', () => {
  expect(chordPitches(cMinor, 60)).toEqual([60, 63, 67])
  expect(chordPitches(cMinor, 60, 'seventh')).toEqual([60, 63, 67, 70])
  expect(chordPitches(fMajor, 65)).toEqual([65, 69, 72])
  expect(chordPitches(cMinor, 64)).toEqual([63, 67, 70]) // E snaps to Eb
  expect(chordPitches(cMinor, 60, 'power')).toEqual([60, 67, 72])
  expect(numeralFor(cMinor, 0)).toBe('i')
  expect(numeralFor(cMinor, 2)).toBe('III')
  expect(numeralFor(fMajor, 0)).toBe('I')
  expect(numeralFor(fMajor, 5)).toBe('vi')
})

it('lays a progression out as held chords over the clip', () => {
  const notes = progressionNotes(fMajor, PROGRESSIONS[0], { totalBeats: 16, octave: 4 })
  expect(notes).toHaveLength(12)
  expect(notes.filter(note => note.start === 0).map(note => note.pitch)).toEqual([53, 57, 60]) // F major
  expect(notes.filter(note => note.start === 4).map(note => note.pitch)).toEqual([60, 64, 67]) // C major (V)
  expect(notes.filter(note => note.start === 8).map(note => note.pitch)).toEqual([62, 65, 69]) // D minor (vi)
  expect(notes.every(note => note.length === 4)).toBe(true)
  const short = progressionNotes(fMajor, PROGRESSIONS[0], { totalBeats: 6, beatsPerChord: 4 })
  expect(short.filter(note => note.start === 4).every(note => note.length === 2)).toBe(true)
})

it('validates stored keys', () => {
  expect(isKey({ root: 11, scale: 'blues' })).toBe(true)
  expect(isKey({ root: 12, scale: 'major' })).toBe(false)
  expect(isKey({ root: 0, scale: 'phrygian' })).toBe(false)
  expect(isKey(null)).toBe(false)
})
