import {
  SCHEMA_VERSION,
  type EffectInstance,
  type EffectParams,
  type EffectType,
  type Pad,
  type Pattern,
  type Project,
  type Step,
  type SynthParams,
  type Track,
  type TrackKind,
} from './types'

export const uid = () => crypto.randomUUID()

export const TRACK_COLORS = ['#d9a441', '#c4583a', '#8abb43', '#5b9bd5', '#b26fc1', '#e0876a', '#3fa89b', '#c9c04a']

export const defaultEffectParams = (): EffectParams => ({
  cutoff: 12000,
  q: 0.7,
  mode: 'lowpass',
  division: 0.5,
  feedback: 0.35,
  mix: 0.3,
  lowGain: 0,
  midGain: 0,
  midFreq: 1000,
  highGain: 0,
  threshold: -18,
  ratio: 4,
  attack: 0.01,
  release: 0.2,
  knee: 6,
  sidechainTrackId: '',
  rate: 0.8,
  depth: 0.004,
  drive: 0.4,
})

export const makeEffect = (type: EffectType, enabled = false): EffectInstance => ({
  id: uid(),
  type,
  enabled,
  params: defaultEffectParams(),
})

export const DEFAULT_TRACK_EFFECTS: EffectType[] = ['filter', 'delay', 'reverb', 'bitcrush']

export const makePad = (startTime = 0, endTime = 0.6): Pad => ({
  id: uid(),
  startTime,
  endTime,
  gain: 0.8,
  pan: 0,
  pitchSemitones: 0,
  loop: false,
  chokeGroup: 0,
  attack: 0.002,
  release: 0.015,
  effects: [],
})

export const makeSynth = (): SynthParams => ({
  osc1: 'sawtooth',
  osc2: 'square',
  osc2Detune: 7,
  osc2Level: 0.5,
  subLevel: 0.3,
  noiseLevel: 0,
  cutoff: 2400,
  resonance: 1.2,
  envAmount: 0.5,
  attack: 0.01,
  decay: 0.25,
  sustain: 0.6,
  release: 0.3,
  glide: 0,
  unison: 1,
  spread: 0.2,
})

export const makeStep = (): Step => ({ active: false, velocity: 1, microTimingMs: 0 })

export function makeTrack(kind: TrackKind, name: string, index: number, sampleBufferId = ''): Track {
  const pads = Array.from({ length: 16 }, () => makePad(0, 0.6))
  return {
    id: uid(),
    name,
    kind,
    color: TRACK_COLORS[index % TRACK_COLORS.length],
    sampleBufferId,
    pads,
    rootNote: 60,
    synth: kind === 'synth' ? makeSynth() : undefined,
    volume: 0.8,
    pan: 0,
    mute: false,
    solo: false,
    effects: DEFAULT_TRACK_EFFECTS.map(type => makeEffect(type)),
    sequencerPadId: pads[0].id,
    sends: [],
  }
}

export const stepsPerBar = (project: Pick<Project, 'timeSignature'>) => Math.max(1, project.timeSignature.beats) * 4

export function makePattern(project: Pick<Project, 'tracks' | 'timeSignature'>, name: string, bars = 1): Pattern {
  return {
    id: uid(),
    name,
    bars,
    trackSteps: project.tracks.map(track => ({
      trackId: track.id,
      steps: Array.from({ length: bars * stepsPerBar(project) }, makeStep),
    })),
  }
}

export function makeProject(): Project {
  const now = Date.now()
  const tracks = ['Kick', 'Snare', 'Closed hat', 'Keys'].map((name, index) => {
    const track = makeTrack('drums', name, index, `factory-${index}`)
    track.pads = Array.from({ length: 16 }, (_, padIndex) => ({
      ...makePad(0, index === 3 ? 1.2 : 0.6),
      pitchSemitones: index === 3 ? padIndex : 0,
    }))
    track.sequencerPadId = track.pads[0].id
    if (index === 2) track.volume = 0.5
    return track
  })
  const timeSignature = { beats: 4, unit: 4 }
  const pattern: Pattern = {
    id: uid(),
    name: 'Pattern A',
    bars: 1,
    trackSteps: tracks.map((track, index) => ({
      trackId: track.id,
      steps: Array.from({ length: 16 }, (_, step) => ({
        active: (index === 0
          ? [0, 6, 8]
          : index === 1
            ? [4, 12]
            : index === 2
              ? [0, 2, 4, 6, 8, 10, 12, 14]
              : [0, 10]
        ).includes(step),
        velocity: index === 2 && step % 4 ? 0.55 : 0.85,
        microTimingMs: 0,
      })),
    })),
  }
  const lane = { id: uid(), name: 'Patterns' }
  return {
    schemaVersion: SCHEMA_VERSION,
    id: uid(),
    name: 'Late night sketches',
    tracks,
    patterns: [pattern],
    lanes: [lane],
    clips: [
      {
        id: uid(),
        kind: 'pattern',
        name: 'Intro',
        laneId: lane.id,
        start: 0,
        length: 8,
        muted: false,
        patternId: pattern.id,
      },
      {
        id: uid(),
        kind: 'pattern',
        name: 'Main',
        laneId: lane.id,
        start: 8,
        length: 16,
        muted: false,
        patternId: pattern.id,
      },
    ],
    bpm: 92,
    swing: 0.12,
    masterVolume: 0.8,
    masterEffects: [makeEffect('limiter', true)],
    timeSignature,
    loop: { enabled: false, start: 0, end: 16 },
    metronome: false,
    countInBars: 0,
    createdAt: now,
    updatedAt: now,
  }
}
