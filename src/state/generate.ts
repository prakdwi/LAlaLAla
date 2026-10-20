/**
 * Pattern, groove, melody and bass generators. Pure functions over steps and notes, seeded so a
 * result can be reproduced, and small enough to read as the "music theory" of the app.
 */
import type { MusicalKey, Note, Step } from './types'
import { inScale, snapToScale, stepInScale, chordPitches } from './scale'
import { uid } from './defaults'

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number) {
  let state = seed >>> 0 || 1
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type DrumRole = 'kick' | 'snare' | 'hat' | 'perc'
export const DRUM_ROLES: DrumRole[] = ['kick', 'snare', 'hat', 'perc']

/** Guess a pad's role from its name. */
export function roleFromName(name = ''): DrumRole {
  const lower = name.toLowerCase()
  if (/kick|808|bd|bass/.test(lower)) return 'kick'
  if (/snare|clap|rim|sd/.test(lower)) return 'snare'
  if (/hat|hh|shaker|ride|cymbal|tick/.test(lower)) return 'hat'
  return 'perc'
}

/** Bjorklund / Euclidean rhythm: `pulses` hits spread as evenly as possible over `steps`. */
export function euclid(steps: number, pulses: number, rotation = 0): number[] {
  if (steps <= 0) return []
  const count = Math.max(0, Math.min(steps, pulses))
  if (!count) return []
  const hits: number[] = []
  for (let index = 0; index < steps; index++) if ((index * count) % steps < count) hits.push(index)
  return hits.map(step => (step + rotation) % steps).sort((a, b) => a - b)
}

export type Hit = { step: number; velocity: number }

type Preset = Record<DrumRole, number[]>
/** One-bar presets (16 steps) per genre and role; ghost notes carry lower velocity through `accent`. */
export const DRUM_PRESETS: Record<string, { label: string; swing: number; bar: Preset }> = {
  house: {
    label: 'House',
    swing: 0.05,
    bar: { kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14], perc: [3, 11] },
  },
  techno: {
    label: 'Techno',
    swing: 0,
    bar: { kick: [0, 4, 8, 12], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], perc: [7, 15] },
  },
  trap: {
    label: 'Trap',
    swing: 0,
    bar: { kick: [0, 7, 10], snare: [8], hat: [0, 2, 4, 6, 8, 9, 10, 11, 12, 14], perc: [14] },
  },
  drill: {
    label: 'Drill',
    swing: 0,
    bar: { kick: [0, 6, 11], snare: [6, 14], hat: [0, 2, 3, 4, 6, 8, 10, 11, 12, 14], perc: [9] },
  },
  boomBap: {
    label: 'Boom bap',
    swing: 0.18,
    bar: { kick: [0, 7, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], perc: [14] },
  },
  lofi: {
    label: 'Lo-fi',
    swing: 0.22,
    bar: { kick: [0, 6, 9], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], perc: [3, 11] },
  },
  afro: {
    label: 'Afrobeats',
    swing: 0.1,
    bar: { kick: [0, 3, 6, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], perc: [7, 11, 14] },
  },
  dnb: {
    label: 'Drum and bass',
    swing: 0,
    bar: { kick: [0, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], perc: [7, 15] },
  },
  reggaeton: {
    label: 'Reggaeton',
    swing: 0,
    bar: { kick: [0, 4, 8, 12], snare: [3, 6, 11, 14], hat: [2, 6, 10, 14], perc: [0, 8] },
  },
  rock: {
    label: 'Rock',
    swing: 0,
    bar: { kick: [0, 8, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], perc: [15] },
  },
}
export const GENRES = Object.keys(DRUM_PRESETS)

const accentFor = (role: DrumRole, step: number) => {
  if (role === 'hat') return step % 4 === 0 ? 0.75 : step % 2 === 0 ? 0.55 : 0.4
  if (role === 'perc') return 0.55
  return step % 4 === 0 ? 0.95 : 0.8
}

/** Preset hits for a role over `bars` bars, repeating the one-bar figure. */
export function presetHits(genre: string, role: DrumRole, bars: number, stepsPerBar = 16): Hit[] {
  const preset = DRUM_PRESETS[genre] ?? DRUM_PRESETS.house
  const hits: Hit[] = []
  for (let bar = 0; bar < bars; bar++)
    for (const step of preset.bar[role]) {
      if (step >= stepsPerBar) continue
      hits.push({ step: bar * stepsPerBar + step, velocity: accentFor(role, step) })
    }
  return hits
}

/**
 * Hits placed by a weighted draw: downbeats are likely, offbeats less, with `density` 0..1 setting
 * how many steps fire. Same seed, same result.
 */
export function densityHits(role: DrumRole, density: number, bars: number, seed = 1, stepsPerBar = 16): Hit[] {
  const random = rng(seed)
  const total = bars * stepsPerBar
  const weight = (step: number) => {
    const inBar = step % stepsPerBar
    const base =
      role === 'kick'
        ? inBar === 0
          ? 1
          : inBar % 4 === 0
            ? 0.5
            : inBar % 2 === 0
              ? 0.3
              : 0.15
        : role === 'snare'
          ? inBar % 8 === 4
            ? 1
            : inBar % 4 === 2
              ? 0.25
              : 0.1
          : role === 'hat'
            ? inBar % 2 === 0
              ? 0.8
              : 0.45
            : inBar % 4 === 3
              ? 0.6
              : 0.3
    return base + random() * 0.35
  }
  const want = Math.round(Math.max(0, Math.min(1, density)) * total * (role === 'hat' ? 0.9 : 0.5))
  const ranked = Array.from({ length: total }, (_, step) => ({ step, weight: weight(step) }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, want)
    .sort((a, b) => a.step - b.step)
  return ranked.map(({ step }) => ({ step, velocity: accentFor(role, step % stepsPerBar) }))
}

/** Replaces the last beat (or the last bar for kicks) with a fill. */
export function fillHits(hits: Hit[], role: DrumRole, bars: number, seed = 1, stepsPerBar = 16): Hit[] {
  const random = rng(seed)
  const total = bars * stepsPerBar
  const fillStart = role === 'kick' ? total - 8 : total - 4
  const kept = hits.filter(hit => hit.step < fillStart)
  const fill: Hit[] = []
  if (role === 'snare')
    for (let step = fillStart; step < total; step++) fill.push({ step, velocity: 0.55 + (step - fillStart) * 0.12 })
  else if (role === 'hat') for (let step = fillStart; step < total; step++) fill.push({ step, velocity: 0.7 })
  else if (role === 'kick') {
    for (let step = fillStart; step < total; step += 2) if (random() > 0.35) fill.push({ step, velocity: 0.85 })
    fill.push({ step: total - 1, velocity: 0.9 })
  } else for (let step = fillStart; step < total; step += 1) if (random() > 0.5) fill.push({ step, velocity: 0.6 })
  return [...kept, ...fill]
}

export type GrooveName = 'straight' | 'mpc60' | 'dilla' | 'pushed' | 'halftime' | 'shuffle'
/** Named grooves: a swing amount plus per-sixteenth timing (ms) and velocity accents. */
export const GROOVES: Record<GrooveName, { label: string; swing: number; timing: number[]; accent: number[] }> = {
  straight: { label: 'Straight', swing: 0, timing: new Array(16).fill(0), accent: new Array(16).fill(1) },
  mpc60: {
    label: 'MPC 60 swing',
    swing: 0.16,
    timing: [0, 0, 0, 4, 0, 0, 0, 4, 0, 0, 0, 4, 0, 0, 0, 4],
    accent: [1, 0.85, 0.9, 0.8, 1, 0.85, 0.9, 0.8, 1, 0.85, 0.9, 0.8, 1, 0.85, 0.9, 0.8],
  },
  dilla: {
    label: 'Late snares',
    swing: 0.2,
    timing: [0, 6, 2, 10, 18, 4, 2, 12, 0, 6, 2, 10, 20, 4, 2, 12],
    accent: [1, 0.7, 0.85, 0.75, 0.95, 0.7, 0.85, 0.75, 1, 0.7, 0.85, 0.75, 0.95, 0.7, 0.85, 0.75],
  },
  pushed: {
    label: 'Pushed (ahead)',
    swing: 0.04,
    timing: [0, -6, -4, -8, -2, -6, -4, -8, 0, -6, -4, -8, -2, -6, -4, -8],
    accent: new Array(16).fill(1),
  },
  halftime: {
    label: 'Half-time lean',
    swing: 0,
    timing: [0, 0, 0, 0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0],
    accent: [1, 0.8, 0.85, 0.8, 0.9, 0.8, 0.85, 0.8, 1, 0.8, 0.85, 0.8, 0.9, 0.8, 0.85, 0.8],
  },
  shuffle: {
    label: 'Shuffle',
    swing: 0.3,
    timing: [0, 0, 0, 8, 0, 0, 0, 8, 0, 0, 0, 8, 0, 0, 0, 8],
    accent: [1, 0.6, 0.9, 0.7, 1, 0.6, 0.9, 0.7, 1, 0.6, 0.9, 0.7, 1, 0.6, 0.9, 0.7],
  },
}

/** Applies a groove's timing and accents to a row of steps (active steps only). */
export function applyGroove(steps: Step[], groove: GrooveName, stepsPerBar = 16): Step[] {
  const { timing, accent } = GROOVES[groove]
  return steps.map((step, index) => {
    if (!step.active) return step
    const position = (index % stepsPerBar) % 16
    return {
      ...step,
      microTimingMs: Math.max(-50, Math.min(50, Math.round(timing[position]))),
      velocity: Math.max(0.05, Math.min(1, step.velocity * accent[position])),
    }
  })
}

/** Random velocity and timing jitter, `amount` 0..1. Same seed, same result. */
export function humanize(steps: Step[], amount: number, seed = 1): Step[] {
  const random = rng(seed)
  const scale = Math.max(0, Math.min(1, amount))
  return steps.map(step => {
    if (!step.active) return step
    const velocity = step.velocity + (random() * 2 - 1) * 0.3 * scale
    const timing = step.microTimingMs + (random() * 2 - 1) * 18 * scale
    return {
      ...step,
      velocity: Math.max(0.05, Math.min(1, velocity)),
      microTimingMs: Math.max(-50, Math.min(50, Math.round(timing))),
    }
  })
}

export const hitsToSteps = (hits: Hit[], steps: Step[], padId?: string): Step[] => {
  const result = steps.map(step =>
    step.active && (padId === undefined || step.padId === padId || (!step.padId && padId !== undefined && false))
      ? step
      : step,
  )
  const cleared = result.map(step =>
    padId === undefined || (step.padId ?? '') === (padId ?? '')
      ? { active: false, velocity: 1, microTimingMs: 0, padId }
      : step,
  )
  for (const hit of hits) {
    if (hit.step < 0 || hit.step >= cleared.length) continue
    cleared[hit.step] = { active: true, velocity: hit.velocity, microTimingMs: 0, padId }
  }
  return cleared
}

export type ChordSpan = { start: number; length: number; pitches: number[] }

/** Groups simultaneous notes (same start) into chords, in time order. */
export function chordsFromNotes(notes: Note[], minimumVoices = 2): ChordSpan[] {
  const groups = new Map<number, Note[]>()
  for (const note of notes) {
    const key = Math.round(note.start * 16) / 16
    groups.set(key, [...(groups.get(key) ?? []), note])
  }
  return [...groups.entries()]
    .filter(([, group]) => group.length >= minimumVoices)
    .sort(([a], [b]) => a - b)
    .map(([start, group]) => ({
      start,
      length: Math.max(...group.map(note => note.length)),
      pitches: [...new Set(group.map(note => note.pitch))].sort((a, b) => a - b),
    }))
}

const chordAt = (chords: ChordSpan[], beat: number) =>
  [...chords].reverse().find(chord => beat >= chord.start && beat < chord.start + chord.length) ??
  chords.find(chord => chord.start <= beat) ??
  chords[0]

/**
 * A melody over the chords: chord tones on strong beats, scale steps between, small intervals,
 * rests when density is low. Range is centred on `centre` (MIDI) with a span of about an octave.
 */
export function melodyNotes(
  key: MusicalKey,
  chords: ChordSpan[],
  options: { totalBeats: number; density?: number; centre?: number; seed?: number; grid?: number },
): Note[] {
  const random = rng(options.seed ?? 1)
  const density = Math.max(0.1, Math.min(1, options.density ?? 0.6))
  const centre = options.centre ?? 72
  const grid = options.grid ?? 0.5
  const low = centre - 7
  const high = centre + 7
  const notes: Note[] = []
  let current = snapToScale(key, centre)
  for (let beat = 0; beat < options.totalBeats; beat += grid) {
    const strong = Math.abs(beat - Math.round(beat)) < 1e-6
    const chance = strong ? density * 1.1 : density * 0.75
    if (random() > chance) continue
    const chord = chords.length ? chordAt(chords, beat) : undefined
    const chordClasses = chord ? chord.pitches.map(pitch => ((pitch % 12) + 12) % 12) : []
    const candidates: number[] = []
    for (let pitch = low; pitch <= high; pitch++) {
      if (!inScale(key, pitch)) continue
      const distance = Math.abs(pitch - current)
      if (distance > 7) continue
      const isChordTone = chordClasses.includes(((pitch % 12) + 12) % 12)
      const weight =
        (strong ? (isChordTone ? 3 : 0.4) : isChordTone ? 1.5 : 1) *
        (distance === 0 ? 0.6 : 1) *
        (1 / (1 + distance * 0.35))
      candidates.push(...Array.from({ length: Math.max(1, Math.round(weight * 10)) }, () => pitch))
    }
    if (!candidates.length) continue
    current = candidates[Math.floor(random() * candidates.length)]
    const remaining = options.totalBeats - beat
    const long = strong && random() < 0.35
    const length = Math.min(remaining, long ? grid * 2 : grid)
    notes.push({
      id: uid(),
      pitch: current,
      start: beat,
      length: Math.max(0.125, length * 0.95),
      velocity: strong ? 0.85 : 0.7,
    })
  }
  return notes
}

/** A bass line on the chord roots, following the kick (beats) or playing eighths when no kick is given. */
export function bassNotes(
  key: MusicalKey,
  chords: ChordSpan[],
  options: { totalBeats: number; kickBeats?: number[]; octave?: number; style?: 'follow' | 'eighths' | 'long' },
): Note[] {
  const octave = options.octave ?? 2
  const style = options.style ?? (options.kickBeats?.length ? 'follow' : 'eighths')
  const rootAt = (beat: number) => {
    const chord = chords.length ? chordAt(chords, beat) : undefined
    const pitchClass = chord ? chord.pitches[0] % 12 : key.root
    return snapToScale(
      key,
      octave * 12 + ((((pitchClass - ((octave * 12) % 12)) % 12) + 12) % 12) + ((octave * 12) % 12),
    )
  }
  const positions =
    style === 'follow'
      ? [...new Set((options.kickBeats ?? []).map(beat => Math.round(beat * 4) / 4))].sort((a, b) => a - b)
      : style === 'eighths'
        ? Array.from({ length: Math.ceil(options.totalBeats / 0.5) }, (_, index) => index * 0.5)
        : chords.length
          ? chords.map(chord => chord.start)
          : [0]
  const notes: Note[] = []
  positions.forEach((beat, index) => {
    if (beat >= options.totalBeats) return
    const next = positions[index + 1] ?? options.totalBeats
    const length = style === 'long' ? next - beat : Math.min(next - beat, style === 'follow' ? 1 : 0.45)
    notes.push({ id: uid(), pitch: rootAt(beat), start: beat, length: Math.max(0.2, length), velocity: 0.85 })
  })
  return notes
}

/** Pitches for a chord on a scale degree, used by the song builder and generators. */
export const chordOnDegree = (key: MusicalKey, degree: number, octave = 4) =>
  chordPitches(key, stepInScale(key, octave * 12 + key.root, degree))
