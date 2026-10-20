/**
 * Genre starters: a complete, playing project in one click. Each template is data (kit, tempo,
 * key, drum hits, chord progression, sounds, sections) applied through the tutorial build
 * helpers, so every starter is a sequence of ordinary undoable edits and nothing here touches the
 * engine directly. The drums, chords and lines are original.
 */
import {
  addEffect,
  addSynth,
  arrange,
  program,
  setMix,
  startProject,
  writeNotes,
  type Hit,
  type KitSound,
} from '../tutorials/build'
import type { NoteSpec } from '../tutorials/build'
import { PROGRESSIONS, progressionNotes, stepInScale, type ChordVoicing, type Progression } from '../state/scale'
import { useStudio } from '../state/store'
import type { EffectParams, EffectType, MusicalKey, SynthParams } from '../state/types'

export type Template = {
  id: string
  name: string
  genre: string
  blurb: string
  bpm: number
  swing: number
  key: MusicalKey
  bars: number
  kit: KitSound[]
  /** pad index to hits, over `bars` bars at 16 steps a bar */
  drums: Record<number, Hit[]>
  progression: Progression
  chords?: {
    name: string
    patch: Partial<SynthParams>
    volume: number
    voicing: ChordVoicing
    octave: number
    effects?: [EffectType, Partial<EffectParams>][]
  }
  bass?: {
    name: string
    patch: Partial<SynthParams>
    volume: number
    octave: number
    follow: 'kick' | 'eighths' | 'offbeat' | 'long'
  }
  lead?: {
    name: string
    patch: Partial<SynthParams>
    volume: number
    notes: (key: MusicalKey) => NoteSpec[]
    effects?: [EffectType, Partial<EffectParams>][]
  }
  sections: { name: string; keep: string[] | 'all'; repeats: number }[]
}

const every = (start: number, step: number, end: number) =>
  Array.from({ length: Math.ceil((end - start) / step) }, (_, i) => start + i * step)
const soft = (steps: number[], velocity: number): Hit[] => steps.map(step => ({ step, velocity }))
const twoBars = (bar: number[]) => [...bar, ...bar.map(step => step + 16)]

const KEYS: Partial<SynthParams> = {
  osc1: 'triangle',
  osc2: 'sine',
  osc2Detune: 12,
  osc2Level: 0.3,
  subLevel: 0.1,
  cutoff: 2600,
  resonance: 0.5,
  envAmount: 0.3,
  attack: 0.005,
  decay: 0.6,
  sustain: 0.4,
  release: 0.5,
  unison: 1,
}
const PAD: Partial<SynthParams> = {
  osc1: 'sawtooth',
  osc2: 'sawtooth',
  osc2Detune: 0.12,
  osc2Level: 0.8,
  cutoff: 1100,
  resonance: 0.6,
  envAmount: 0.1,
  attack: 0.6,
  decay: 1,
  sustain: 0.8,
  release: 1.4,
  unison: 3,
  spread: 0.6,
}
const SUB: Partial<SynthParams> = {
  osc1: 'sine',
  osc2: 'sine',
  osc2Level: 0,
  subLevel: 0.6,
  cutoff: 900,
  resonance: 0.2,
  envAmount: 0.1,
  attack: 0.005,
  decay: 0.3,
  sustain: 0.9,
  release: 0.2,
  glide: 0.08,
  unison: 1,
}
const PLUCK: Partial<SynthParams> = {
  osc1: 'sawtooth',
  osc2: 'square',
  osc2Detune: 7,
  osc2Level: 0.4,
  cutoff: 1800,
  resonance: 1.4,
  envAmount: 0.7,
  attack: 0.003,
  decay: 0.22,
  sustain: 0.05,
  release: 0.2,
  unison: 2,
  spread: 0.3,
}
const RHODES: Partial<SynthParams> = {
  osc1: 'sine',
  osc2: 'triangle',
  osc2Detune: 19,
  osc2Level: 0.25,
  subLevel: 0,
  cutoff: 1800,
  resonance: 0.4,
  envAmount: 0.25,
  attack: 0.004,
  decay: 0.9,
  sustain: 0.3,
  release: 0.6,
  unison: 1,
}
const ORGAN_BASS: Partial<SynthParams> = {
  osc1: 'square',
  osc2: 'sawtooth',
  osc2Detune: 0,
  osc2Level: 0.5,
  subLevel: 0.4,
  cutoff: 700,
  resonance: 0.8,
  envAmount: 0.4,
  attack: 0.004,
  decay: 0.18,
  sustain: 0.4,
  release: 0.12,
  unison: 1,
}

/** A simple arpeggiated hook over the progression: root, third, fifth, third per chord. */
const hook =
  (octave: number, rhythm: number[] = [0, 0.5, 1, 1.5]) =>
  (key: MusicalKey, progression: Progression, beatsPerChord: number, totalBeats: number): NoteSpec[] => {
    const notes: NoteSpec[] = []
    const tonic = octave * 12 + key.root
    for (let beat = 0, index = 0; beat < totalBeats; beat += beatsPerChord, index++) {
      const root = stepInScale(key, tonic, progression.degrees[index % progression.degrees.length])
      const tones = [root, stepInScale(key, root, 2), stepInScale(key, root, 4), stepInScale(key, root, 2)]
      rhythm.forEach((offset, i) => {
        if (beat + offset < totalBeats) notes.push([tones[i % tones.length], beat + offset, 0.45, 0.75])
      })
    }
    return notes
  }

export const TEMPLATES: Template[] = [
  {
    id: 'trap',
    name: 'Trap',
    genre: 'Trap',
    blurb: '140 BPM half-time. Long 808, rolling hats, a dark pad.',
    bpm: 140,
    swing: 0,
    key: { root: 5, scale: 'minor' },
    bars: 2,
    kit: [
      { name: '808 kick', kind: 'kick', params: { pitch: 46, sweep: 0.55, decay: 1.2, click: 0.35, drive: 0.5 } },
      { name: 'Clap', kind: 'clap', params: { noiseDecay: 0.2, tone: 3500 } },
      { name: 'Hat', kind: 'hat', params: { decay: 0.03, noiseDecay: 0.045 } },
      { name: 'Open hat', kind: 'hat', params: { decay: 0.2, noiseDecay: 0.3 } },
      { name: 'Snare', kind: 'snare', params: { pitch: 210, noiseDecay: 0.15, tone: 8000 } },
    ],
    drums: {
      0: [0, 7, 10, 16, 22, 25, 29],
      1: [8, 24],
      2: [...soft(every(0, 2, 24), 0.6), ...soft(every(24, 1, 32), 0.5)],
      3: soft([14, 30], 0.6),
    },
    progression: PROGRESSIONS.find(item => item.name === 'i  VI  VII  i')!,
    chords: { name: 'Pad', patch: PAD, volume: 0.35, voicing: 'triad', octave: 4, effects: [['reverb', { mix: 0.5 }]] },
    bass: { name: '808 bass', patch: { ...SUB, glide: 0.12 }, volume: 0.75, octave: 2, follow: 'kick' },
    lead: {
      name: 'Bell',
      patch: { ...KEYS, osc1: 'triangle', osc2Level: 0.4, decay: 0.5, sustain: 0.15, release: 1.4, cutoff: 3200 },
      volume: 0.45,
      notes: key =>
        hook(5, [0, 1.5, 2, 3])(
          key,
          PROGRESSIONS.find(item => item.name === 'i  VI  VII  i')!,
          4,
          8,
        ),
      effects: [
        ['reverb', { mix: 0.55 }],
        ['delay', { division: 0.75, feedback: 0.4, mix: 0.25 }],
      ],
    },
    sections: [
      { name: 'Intro', keep: ['Pad', 'Bell'], repeats: 2 },
      { name: 'Drop', keep: 'all', repeats: 4 },
      { name: 'Break', keep: ['Pad', 'Bell', '808 bass'], repeats: 2 },
      { name: 'Drop 2', keep: 'all', repeats: 4 },
    ],
  },
  {
    id: 'boom-bap',
    name: 'Boom bap',
    genre: 'Hip-hop',
    blurb: '90 BPM with swing. Dusty kick and snare, Rhodes chords.',
    bpm: 90,
    swing: 0.18,
    key: { root: 2, scale: 'dorian' },
    bars: 2,
    kit: [
      {
        name: 'Kick',
        kind: 'kick',
        params: { pitch: 52, sweep: 0.4, decay: 0.35, click: 0.2, drive: 0.6, tone: 2500 },
      },
      { name: 'Snare', kind: 'snare', params: { pitch: 180, noise: 0.7, noiseDecay: 0.18, tone: 3500, drive: 0.4 } },
      { name: 'Hat', kind: 'hat', params: { decay: 0.03, noiseDecay: 0.05, tone: 6000 } },
      { name: 'Rim', kind: 'perc', params: { pitch: 1200, decay: 0.04, click: 0.8 } },
    ],
    drums: {
      0: [0, 7, 10, 16, 19, 26],
      1: twoBars([4, 12]),
      2: [...soft(every(0, 2, 32), 0.55), ...soft([3, 11, 19, 27], 0.3)],
      3: soft([14, 30], 0.45),
    },
    progression: PROGRESSIONS.find(item => item.name === 'ii  V  I  vi')!,
    chords: {
      name: 'Rhodes',
      patch: RHODES,
      volume: 0.5,
      voicing: 'seventh',
      octave: 4,
      effects: [['chorus', { mix: 0.3 }]],
    },
    bass: { name: 'Bass', patch: { ...SUB, glide: 0 }, volume: 0.7, octave: 2, follow: 'kick' },
    sections: [
      { name: 'Intro', keep: ['Rhodes'], repeats: 2 },
      { name: 'Verse', keep: 'all', repeats: 4 },
      { name: 'Break', keep: ['Rhodes', 'Bass'], repeats: 2 },
      { name: 'Verse 2', keep: 'all', repeats: 4 },
    ],
  },
  {
    id: 'house',
    name: 'House',
    genre: 'House',
    blurb: '124 BPM four-on-the-floor. Offbeat hats, stabbed chords, driving bass.',
    bpm: 124,
    swing: 0.05,
    key: { root: 9, scale: 'minor' },
    bars: 2,
    kit: [
      { name: 'Kick', kind: 'kick', params: { pitch: 58, sweep: 0.5, decay: 0.3, click: 0.6, drive: 0.4 } },
      { name: 'Clap', kind: 'clap', params: { noiseDecay: 0.16 } },
      { name: 'Hat', kind: 'hat', params: { decay: 0.03, noiseDecay: 0.05 } },
      { name: 'Open hat', kind: 'hat', params: { decay: 0.15, noiseDecay: 0.22 } },
      { name: 'Perc', kind: 'perc', params: { pitch: 800, decay: 0.06 } },
    ],
    drums: {
      0: every(0, 4, 32),
      1: twoBars([4, 12]),
      2: soft(every(0, 2, 32), 0.5),
      3: soft(every(2, 4, 32), 0.7),
      4: soft([3, 7, 11, 14, 19, 23, 27, 30], 0.45),
    },
    progression: PROGRESSIONS.find(item => item.name === 'i  VI  iv  v')!,
    chords: {
      name: 'Stab',
      patch: { ...PLUCK, decay: 0.3, sustain: 0.1, cutoff: 2600 },
      volume: 0.45,
      voicing: 'seventh',
      octave: 4,
      effects: [['delay', { division: 0.75, feedback: 0.3, mix: 0.2 }]],
    },
    bass: { name: 'Bass', patch: ORGAN_BASS, volume: 0.7, octave: 2, follow: 'offbeat' },
    sections: [
      { name: 'Intro', keep: ['Kit'], repeats: 2 },
      { name: 'Build', keep: ['Kit', 'Bass'], repeats: 2 },
      { name: 'Main', keep: 'all', repeats: 4 },
      { name: 'Breakdown', keep: ['Stab'], repeats: 2 },
      { name: 'Main 2', keep: 'all', repeats: 4 },
    ],
  },
  {
    id: 'lofi',
    name: 'Lo-fi',
    genre: 'Lo-fi hip-hop',
    blurb: '78 BPM, lazy swing. Soft drums, jazzy sevenths, warm bass.',
    bpm: 78,
    swing: 0.22,
    key: { root: 10, scale: 'major' },
    bars: 2,
    kit: [
      {
        name: 'Kick',
        kind: 'kick',
        params: { pitch: 50, sweep: 0.35, decay: 0.3, click: 0.15, drive: 0.5, tone: 1800 },
      },
      { name: 'Snare', kind: 'snare', params: { pitch: 170, noise: 0.6, noiseDecay: 0.14, tone: 2800, drive: 0.5 } },
      { name: 'Hat', kind: 'hat', params: { decay: 0.025, noiseDecay: 0.04, tone: 5000 } },
      {
        name: 'Shaker',
        kind: 'hat',
        params: { pitch: 600, character: 0.3, decay: 0.05, noiseDecay: 0.09, tone: 4000 },
      },
    ],
    drums: {
      0: [0, 6, 16, 22, 25],
      1: twoBars([4, 12]),
      2: [...soft(every(0, 2, 32), 0.45), ...soft([7, 15, 23, 31], 0.25)],
      3: soft(every(1, 2, 32), 0.3),
    },
    progression: PROGRESSIONS.find(item => item.name === 'ii  V  I  vi')!,
    chords: {
      name: 'Keys',
      patch: { ...RHODES, cutoff: 1400 },
      volume: 0.5,
      voicing: 'seventh',
      octave: 4,
      effects: [
        ['bitcrush', { mix: 0.25 }],
        ['reverb', { mix: 0.3 }],
      ],
    },
    bass: { name: 'Bass', patch: { ...SUB, cutoff: 600 }, volume: 0.65, octave: 2, follow: 'long' },
    sections: [
      { name: 'Intro', keep: ['Keys'], repeats: 2 },
      { name: 'Loop', keep: 'all', repeats: 6 },
      { name: 'Outro', keep: ['Keys', 'Bass'], repeats: 2 },
    ],
  },
  {
    id: 'drill',
    name: 'Drill',
    genre: 'UK drill',
    blurb: '142 BPM. Sliding 808, syncopated snares on the 3-and, eerie plucks.',
    bpm: 142,
    swing: 0,
    key: { root: 7, scale: 'harmonicMinor' },
    bars: 2,
    kit: [
      { name: '808', kind: 'kick', params: { pitch: 44, sweep: 0.5, decay: 1.1, click: 0.3, drive: 0.55 } },
      { name: 'Snare', kind: 'snare', params: { pitch: 220, noise: 0.85, noiseDecay: 0.16, tone: 9000 } },
      { name: 'Hat', kind: 'hat', params: { decay: 0.025, noiseDecay: 0.04 } },
      { name: 'Open hat', kind: 'hat', params: { decay: 0.18, noiseDecay: 0.25 } },
      { name: 'Perc', kind: 'perc', params: { pitch: 1000, decay: 0.05, click: 0.6 } },
    ],
    drums: {
      0: [0, 6, 11, 16, 21, 27],
      1: [6, 14, 22, 30],
      2: [
        ...soft([0, 2, 3, 4, 6, 8, 10, 11, 12, 14], 0.55),
        ...soft([16, 18, 19, 20, 22, 24, 26, 27, 28, 30, 31], 0.55),
      ],
      3: soft([9, 25], 0.5),
      4: soft([5, 13, 21, 29], 0.4),
    },
    progression: PROGRESSIONS.find(item => item.name === 'i  iv  v  i')!,
    chords: {
      name: 'Pad',
      patch: { ...PAD, cutoff: 800 },
      volume: 0.3,
      voicing: 'triad',
      octave: 4,
      effects: [['reverb', { mix: 0.5 }]],
    },
    bass: { name: '808 bass', patch: { ...SUB, glide: 0.15 }, volume: 0.75, octave: 2, follow: 'kick' },
    lead: {
      name: 'Pluck',
      patch: { ...PLUCK, cutoff: 2200, decay: 0.3 },
      volume: 0.4,
      notes: key =>
        hook(5, [0, 0.75, 1.5, 3])(
          key,
          PROGRESSIONS.find(item => item.name === 'i  iv  v  i')!,
          4,
          8,
        ),
      effects: [['delay', { division: 0.375, feedback: 0.35, mix: 0.3 }]],
    },
    sections: [
      { name: 'Intro', keep: ['Pad', 'Pluck'], repeats: 2 },
      { name: 'Verse', keep: 'all', repeats: 4 },
      { name: 'Switch', keep: ['Pad', 'Pluck', '808 bass'], repeats: 2 },
      { name: 'Verse 2', keep: 'all', repeats: 4 },
    ],
  },
  {
    id: 'afro',
    name: 'Afrobeats',
    genre: 'Afrobeats',
    blurb: '104 BPM. Bouncy kick pattern, log-drum bass, bright keys.',
    bpm: 104,
    swing: 0.1,
    key: { root: 4, scale: 'major' },
    bars: 2,
    kit: [
      { name: 'Kick', kind: 'kick', params: { pitch: 56, sweep: 0.45, decay: 0.28, click: 0.4, drive: 0.35 } },
      { name: 'Rim', kind: 'perc', params: { pitch: 1300, decay: 0.05, click: 0.9 } },
      { name: 'Hat', kind: 'hat', params: { decay: 0.03, noiseDecay: 0.05 } },
      {
        name: 'Shaker',
        kind: 'hat',
        params: { pitch: 700, character: 0.3, decay: 0.05, noiseDecay: 0.08, tone: 5000 },
      },
      { name: 'Conga', kind: 'tom', params: { pitch: 240, decay: 0.16, sweep: 0.3 } },
      { name: 'Clap', kind: 'clap' },
    ],
    drums: {
      0: [0, 3, 6, 10, 16, 19, 22, 26],
      1: soft([4, 12, 20, 28], 0.7),
      2: soft(every(0, 2, 32), 0.5),
      3: soft(every(1, 2, 32), 0.35),
      4: soft([7, 11, 14, 23, 27, 30], 0.6),
      5: soft([12, 28], 0.5),
    },
    progression: PROGRESSIONS.find(item => item.name === 'I  V  vi  IV')!,
    chords: {
      name: 'Keys',
      patch: KEYS,
      volume: 0.45,
      voicing: 'triad',
      octave: 5,
      effects: [['delay', { division: 0.5, feedback: 0.25, mix: 0.15 }]],
    },
    bass: {
      name: 'Log bass',
      patch: { ...PLUCK, osc1: 'sine', osc2: 'triangle', cutoff: 1200, decay: 0.35, sustain: 0.2 },
      volume: 0.7,
      octave: 2,
      follow: 'kick',
    },
    sections: [
      { name: 'Intro', keep: ['Keys', 'Kit'], repeats: 2 },
      { name: 'Groove', keep: 'all', repeats: 4 },
      { name: 'Break', keep: ['Keys', 'Log bass'], repeats: 2 },
      { name: 'Groove 2', keep: 'all', repeats: 4 },
    ],
  },
  {
    id: 'pop',
    name: 'Pop',
    genre: 'Pop',
    blurb: '118 BPM. Clean kick and clap, big pad, a plucked hook on the classic four chords.',
    bpm: 118,
    swing: 0,
    key: { root: 0, scale: 'major' },
    bars: 2,
    kit: [
      { name: 'Kick', kind: 'kick', params: { pitch: 60, sweep: 0.5, decay: 0.32, click: 0.6, drive: 0.3 } },
      { name: 'Clap', kind: 'clap', params: { noiseDecay: 0.18 } },
      { name: 'Hat', kind: 'hat', params: { decay: 0.03, noiseDecay: 0.05 } },
      { name: 'Snare', kind: 'snare', params: { pitch: 200, noise: 0.9, noiseDecay: 0.2, drive: 0.3 } },
      { name: 'Open hat', kind: 'hat', params: { decay: 0.16, noiseDecay: 0.24 } },
    ],
    drums: {
      0: [0, 8, 10, 16, 24, 26],
      1: twoBars([4, 12]),
      2: soft(every(0, 2, 32), 0.5),
      3: soft([28, 30], 0.6),
      4: soft([6, 22], 0.55),
    },
    progression: PROGRESSIONS.find(item => item.name === 'I  V  vi  IV')!,
    chords: {
      name: 'Pad',
      patch: { ...PAD, cutoff: 1600, attack: 0.3 },
      volume: 0.35,
      voicing: 'spread',
      octave: 4,
      effects: [['reverb', { mix: 0.4 }]],
    },
    bass: { name: 'Bass', patch: ORGAN_BASS, volume: 0.65, octave: 2, follow: 'eighths' },
    lead: {
      name: 'Hook',
      patch: { ...PLUCK, cutoff: 3000 },
      volume: 0.45,
      notes: key =>
        hook(5)(
          key,
          PROGRESSIONS.find(item => item.name === 'I  V  vi  IV')!,
          4,
          8,
        ),
      effects: [['delay', { division: 0.375, feedback: 0.3, mix: 0.25 }]],
    },
    sections: [
      { name: 'Intro', keep: ['Pad', 'Hook'], repeats: 2 },
      { name: 'Verse', keep: ['Kit', 'Bass', 'Pad'], repeats: 4 },
      { name: 'Chorus', keep: 'all', repeats: 4 },
      { name: 'Verse 2', keep: ['Kit', 'Bass', 'Pad'], repeats: 4 },
      { name: 'Chorus 2', keep: 'all', repeats: 4 },
    ],
  },
]

const KIT = 'Kit'
const PATTERN = 'Main'

/** Bass line from the chord roots, following the kick or a fixed rhythm. */
function bassNotes(template: Template, kickSteps: number[]): NoteSpec[] {
  const { key, progression, bars } = template
  const bass = template.bass!
  const beatsPerChord = 4
  const totalBeats = bars * 4
  const tonic = bass.octave * 12 + key.root
  const rootAt = (beat: number) =>
    stepInScale(key, tonic, progression.degrees[Math.floor(beat / beatsPerChord) % progression.degrees.length])
  const rhythm =
    bass.follow === 'kick'
      ? kickSteps.map(step => step / 4)
      : bass.follow === 'eighths'
        ? every(0, 0.5, totalBeats)
        : bass.follow === 'offbeat'
          ? every(0.5, 1, totalBeats)
          : every(0, beatsPerChord, totalBeats)
  const notes: NoteSpec[] = []
  rhythm.forEach((beat, index) => {
    const next = rhythm[index + 1] ?? totalBeats
    const length = bass.follow === 'long' ? beatsPerChord : Math.min(next - beat, bass.follow === 'kick' ? 1 : 0.4)
    notes.push([rootAt(beat), beat, Math.max(0.2, length), 0.85])
  })
  return notes
}

/** Build the template as the current project. Returns the project name. */
export async function applyTemplate(template: Template, name = `${template.name} starter`) {
  await startProject({
    name,
    bpm: template.bpm,
    swing: template.swing,
    kitName: KIT,
    sounds: template.kit,
    patternName: PATTERN,
    bars: template.bars,
  })
  useStudio.getState().edit('Set key', draft => {
    draft.key = { ...template.key }
  })
  for (const [pad, hits] of Object.entries(template.drums)) program(name, PATTERN, KIT, Number(pad), hits)
  const totalBeats = template.bars * 4
  if (template.chords) {
    const chords = template.chords
    addSynth(name, chords.name, chords.patch, chords.volume)
    const notes = progressionNotes(template.key, template.progression, {
      totalBeats,
      beatsPerChord: 4,
      voicing: chords.voicing,
      octave: chords.octave,
      velocity: 0.65,
    })
    writeNotes(
      name,
      PATTERN,
      chords.name,
      notes.map(note => [note.pitch, note.start, note.length, note.velocity]),
    )
    for (const [type, params] of chords.effects ?? []) addEffect(name, chords.name, type, params)
  }
  if (template.bass) {
    addSynth(name, template.bass.name, template.bass.patch, template.bass.volume)
    const kicks = (template.drums[0] ?? []).map(hit => (typeof hit === 'number' ? hit : hit.step))
    writeNotes(name, PATTERN, template.bass.name, bassNotes(template, kicks))
  }
  if (template.lead) {
    addSynth(name, template.lead.name, template.lead.patch, template.lead.volume)
    writeNotes(name, PATTERN, template.lead.name, template.lead.notes(template.key))
    for (const [type, params] of template.lead.effects ?? []) addEffect(name, template.lead.name, type, params)
  }
  setMix(name, KIT, 0.85)
  arrange(name, PATTERN, template.sections)
  const state = useStudio.getState()
  const kit = state.project.tracks.find(track => track.name === KIT)
  if (kit) {
    const { selectTrack } = await import('../state/actions')
    selectTrack(kit)
  }
  return name
}

export const randomTemplate = () => TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)]
