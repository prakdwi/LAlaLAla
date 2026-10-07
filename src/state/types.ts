/**
 * Project schema. Bump SCHEMA_VERSION and add a step in migrate.ts whenever this changes.
 *
 * Time units: clip positions and lengths are in beats (quarter notes). Pattern steps are
 * sixteenth notes, so a bar holds timeSignature.beats * 4 steps.
 */
export const SCHEMA_VERSION = 3

export type EffectType =
  'filter' | 'delay' | 'reverb' | 'bitcrush' | 'eq' | 'compressor' | 'chorus' | 'saturation' | 'limiter'

export type EffectParams = {
  // filter
  cutoff: number
  q: number
  mode: 'lowpass' | 'highpass' | 'bandpass'
  // delay
  division: number
  feedback: number
  // shared
  mix: number
  // eq
  lowGain: number
  midGain: number
  midFreq: number
  highGain: number
  // compressor / limiter
  threshold: number
  ratio: number
  attack: number
  release: number
  knee: number
  sidechainTrackId: string
  // chorus
  rate: number
  depth: number
  // saturation
  drive: number
}

export type EffectInstance = {
  id: string
  type: EffectType
  enabled: boolean
  params: EffectParams
}

export type Pad = {
  id: string
  startTime: number
  endTime: number
  gain: number
  pan: number
  pitchSemitones: number
  loop: boolean
  chokeGroup: number
  attack: number
  release: number
  /** play the region backwards */
  reverse: boolean
  /** silenced in sequence playback (live hits still sound) */
  mute: boolean
  name?: string
  effects: EffectInstance[]
}

export type TrackKind = 'drums' | 'keys' | 'synth' | 'audio' | 'bus'

export type SynthParams = {
  osc1: OscillatorType
  osc2: OscillatorType
  osc2Detune: number
  osc2Level: number
  subLevel: number
  noiseLevel: number
  cutoff: number
  resonance: number
  envAmount: number
  attack: number
  decay: number
  sustain: number
  release: number
  glide: number
  unison: number
  spread: number
}

export type Send = { busId: string; level: number }

export type Track = {
  id: string
  name: string
  kind: TrackKind
  color: string
  /** drums and keys: the sample this track plays. Empty for synth, audio and bus tracks. */
  sampleBufferId: string
  pads: Pad[]
  /** keys: MIDI note the sample is pitched at. */
  rootNote: number
  synth?: SynthParams
  volume: number
  pan: number
  mute: boolean
  solo: boolean
  effects: EffectInstance[]
  sequencerPadId: string
  sends: Send[]
  /** Route this track into a bus track instead of the master. */
  outputBusId?: string
  /** audio: monitor live input while armed. */
  monitor?: boolean
  armed?: boolean
}

export type Step = { active: boolean; velocity: number; microTimingMs: number; padId?: string }
/** One track's row in a pattern: step hits for pads plus polyphonic pitched notes (beats from pattern start). */
export type PatternRow = { trackId: string; steps: Step[]; notes: Note[] }
export type Pattern = { id: string; name: string; bars: number; trackSteps: PatternRow[] }

export type Note = { id: string; pitch: number; start: number; length: number; velocity: number }

export type AutomationTarget =
  | { kind: 'track'; trackId: string; param: 'volume' | 'pan' }
  | { kind: 'effect'; trackId: string; effectId: string; param: keyof EffectParams }
  | { kind: 'master'; param: 'volume' }

export type AutomationPoint = { beat: number; value: number }

type ClipBase = {
  id: string
  name: string
  laneId: string
  start: number
  length: number
  muted: boolean
  color?: string
}
export type PatternClip = ClipBase & { kind: 'pattern'; patternId: string }
export type MidiClip = ClipBase & { kind: 'midi'; trackId: string; notes: Note[]; loopLength: number }
export type AudioClip = ClipBase & {
  kind: 'audio'
  trackId: string
  bufferId: string
  /** seconds into the source buffer where the clip begins */
  offset: number
  gain: number
  fadeIn: number
  fadeOut: number
  pitchSemitones: number
}
export type AutomationClip = ClipBase & { kind: 'automation'; target: AutomationTarget; points: AutomationPoint[] }
export type Clip = PatternClip | MidiClip | AudioClip | AutomationClip

export type Lane = { id: string; name: string }
export type TimeSignature = { beats: number; unit: number }
export type LoopRegion = { enabled: boolean; start: number; end: number }

export type Project = {
  schemaVersion: number
  id: string
  name: string
  tracks: Track[]
  patterns: Pattern[]
  lanes: Lane[]
  clips: Clip[]
  bpm: number
  swing: number
  masterVolume: number
  masterEffects: EffectInstance[]
  timeSignature: TimeSignature
  loop: LoopRegion
  metronome: boolean
  countInBars: number
  jamSource?: { videoId: string; start: number; cueIn?: number; cueOut?: number }
  jamPatternId?: string
  createdAt: number
  updatedAt: number
}

/** Cross-project sound library (IndexedDB 'library' store). Audio lives in the 'audio' store by bufferId. */
export type LibraryItem =
  | {
      id: string
      kind: 'sample'
      name: string
      createdAt: number
      bufferId: string
      duration: number
      slices: number[]
      tags: string[]
    }
  | { id: string; kind: 'kit'; name: string; createdAt: number; sampleBufferId: string; pads: Pad[]; tags: string[] }
  | { id: string; kind: 'synth'; name: string; createdAt: number; synth: SynthParams; tags: string[] }

export type ProjectSummary = { id: string; name: string; updatedAt: number; bpm: number; trackCount: number }
