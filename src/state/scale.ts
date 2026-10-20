/**
 * Music theory helpers behind scale lock, chord mode and the progression picker. Pure functions
 * over MIDI pitches so the editors, the keyboard and the generators share one definition of
 * "in key".
 */
import type { MusicalKey, Note, ScaleName } from './types'
import { NOTE_NAMES } from '../audio/midi'
import { uid } from './defaults'

export const SCALES: Record<ScaleName, { label: string; steps: number[] }> = {
  major: { label: 'Major', steps: [0, 2, 4, 5, 7, 9, 11] },
  minor: { label: 'Minor', steps: [0, 2, 3, 5, 7, 8, 10] },
  dorian: { label: 'Dorian', steps: [0, 2, 3, 5, 7, 9, 10] },
  mixolydian: { label: 'Mixolydian', steps: [0, 2, 4, 5, 7, 9, 10] },
  harmonicMinor: { label: 'Harmonic minor', steps: [0, 2, 3, 5, 7, 8, 11] },
  pentatonicMajor: { label: 'Major pentatonic', steps: [0, 2, 4, 7, 9] },
  pentatonicMinor: { label: 'Minor pentatonic', steps: [0, 3, 5, 7, 10] },
  blues: { label: 'Blues', steps: [0, 3, 5, 6, 7, 10] },
}
export const SCALE_NAMES = Object.keys(SCALES) as ScaleName[]

export const isKey = (value: unknown): value is MusicalKey =>
  typeof value === 'object' &&
  value !== null &&
  Number.isInteger((value as MusicalKey).root) &&
  (value as MusicalKey).root >= 0 &&
  (value as MusicalKey).root < 12 &&
  (value as MusicalKey).scale in SCALES

export const keyName = (key: MusicalKey) => `${NOTE_NAMES[key.root]} ${SCALES[key.scale].label.toLowerCase()}`

const mod12 = (value: number) => ((value % 12) + 12) % 12

/** Pitch classes (0-11) that belong to the key. */
export const pitchClasses = (key: MusicalKey) => SCALES[key.scale].steps.map(step => mod12(key.root + step))

export const inScale = (key: MusicalKey, pitch: number) => pitchClasses(key).includes(mod12(pitch))

/** Nearest in-scale pitch; ties resolve downwards so a sharp lands on the note below it. */
export function snapToScale(key: MusicalKey, pitch: number) {
  if (inScale(key, pitch)) return pitch
  for (let distance = 1; distance < 12; distance++) {
    if (inScale(key, pitch - distance)) return pitch - distance
    if (inScale(key, pitch + distance)) return pitch + distance
  }
  return pitch
}

/** 0-based scale degree of a pitch, or -1 when it is outside the key. */
export const degreeOf = (key: MusicalKey, pitch: number) => pitchClasses(key).indexOf(mod12(pitch))

/** The pitch `degrees` scale steps above (or below, when negative) `pitch`, walking the scale. */
export function stepInScale(key: MusicalKey, pitch: number, degrees: number) {
  let result = snapToScale(key, pitch)
  const direction = Math.sign(degrees)
  for (let remaining = Math.abs(degrees); remaining > 0; remaining--) {
    do result += direction
    while (!inScale(key, result))
  }
  return result
}

export type ChordVoicing = 'triad' | 'seventh' | 'spread' | 'power'

/** Diatonic chord built on `root` (snapped to the key): thirds stacked by walking the scale. */
export function chordPitches(key: MusicalKey, root: number, voicing: ChordVoicing = 'triad') {
  const base = snapToScale(key, root)
  if (voicing === 'power') return [base, base + 7, base + 12]
  const stacked = voicing === 'seventh' ? [0, 2, 4, 6] : [0, 2, 4]
  const pitches = stacked.map(degrees => stepInScale(key, base, degrees))
  if (voicing === 'spread') return [pitches[0] - 12, pitches[0], pitches[2], pitches[1] + 12]
  return pitches
}

/** Roman numeral for a chord on a scale degree, upper case for major triads. */
export function numeralFor(key: MusicalKey, degree: number) {
  const steps = SCALES[key.scale].steps.length
  const root = stepInScale(key, key.root + 60, degree)
  const third = stepInScale(key, root, 2) - root
  const numerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']
  const numeral = numerals[((degree % steps) + steps) % steps] ?? String(degree + 1)
  return third === 4 ? numeral : numeral.toLowerCase()
}

export type Progression = { name: string; degrees: number[]; feel: string }

/** Common four-chord loops, as 0-based scale degrees. Written for 7-note scales. */
export const PROGRESSIONS: Progression[] = [
  { name: 'I  V  vi  IV', degrees: [0, 4, 5, 3], feel: 'pop anthem' },
  { name: 'vi  IV  I  V', degrees: [5, 3, 0, 4], feel: 'emotional pop' },
  { name: 'I  vi  IV  V', degrees: [0, 5, 3, 4], feel: 'doo-wop, classic' },
  { name: 'I  IV  V  IV', degrees: [0, 3, 4, 3], feel: 'rock, simple' },
  { name: 'ii  V  I  I', degrees: [1, 4, 0, 0], feel: 'jazz turnaround' },
  { name: 'I  IV  vi  V', degrees: [0, 3, 5, 4], feel: 'bright pop' },
  { name: 'vi  V  IV  V', degrees: [5, 4, 3, 4], feel: 'driving, anthemic' },
  { name: 'I  iii  IV  V', degrees: [0, 2, 3, 4], feel: 'uplifting' },
  { name: 'i  VI  III  VII', degrees: [0, 5, 2, 6], feel: 'minor epic (use a minor key)' },
  { name: 'i  iv  v  i', degrees: [0, 3, 4, 0], feel: 'dark, minor' },
  { name: 'i  VII  VI  VII', degrees: [0, 6, 5, 6], feel: 'minor rock' },
  { name: 'i  VI  VII  i', degrees: [0, 5, 6, 0], feel: 'trap, drill' },
  { name: 'i  iv  VI  V', degrees: [0, 3, 5, 4], feel: 'andalusian-ish' },
  { name: 'i  III  VII  VI', degrees: [0, 2, 6, 5], feel: 'melancholy' },
  { name: 'ii  V  I  vi', degrees: [1, 4, 0, 5], feel: 'lo-fi, neo-soul' },
  { name: 'IV  V  iii  vi', degrees: [3, 4, 2, 5], feel: 'city pop, J-pop' },
  { name: 'I  V  IV  IV', degrees: [0, 4, 3, 3], feel: 'folk, country' },
  { name: 'i  i  iv  iv', degrees: [0, 0, 3, 3], feel: 'two-chord groove' },
  { name: 'I  I  I  I', degrees: [0, 0, 0, 0], feel: 'one chord, let the drums talk' },
  { name: 'i  VI  iv  v', degrees: [0, 5, 3, 4], feel: 'house, afro' },
]

/** Lays a progression out as held chords, one chord per `beatsPerChord`, over `totalBeats`. */
export function progressionNotes(
  key: MusicalKey,
  progression: Progression,
  options: { octave?: number; voicing?: ChordVoicing; beatsPerChord?: number; totalBeats: number; velocity?: number },
): Note[] {
  const octave = options.octave ?? 4
  const beatsPerChord = options.beatsPerChord ?? 4
  const voicing = options.voicing ?? 'triad'
  const velocity = options.velocity ?? 0.7
  const tonic = octave * 12 + key.root
  const notes: Note[] = []
  for (let beat = 0, index = 0; beat < options.totalBeats; beat += beatsPerChord, index++) {
    const degree = progression.degrees[index % progression.degrees.length]
    const root = stepInScale(key, tonic, degree)
    const length = Math.min(beatsPerChord, options.totalBeats - beat)
    for (const pitch of chordPitches(key, root, voicing))
      notes.push({ id: uid(), pitch, start: beat, length, velocity })
  }
  return notes
}
