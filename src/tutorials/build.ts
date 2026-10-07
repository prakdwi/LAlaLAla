/**
 * Small builder used by the tutorials: each tutorial step calls these to make the change it
 * describes in the current project, through normal undoable edits.
 */
import { engine } from '../audio/engine'
import { DRUM_DEFAULTS, renderDrum, type DrumKind, type DrumParams } from '../audio/drums'
import { encodeWav } from '../audio/wav'
import { importProject } from '../db/persistence'
import {
  makeEffect,
  makePattern,
  makeProject,
  makeStep,
  makeSynth,
  makeTrack,
  stepsPerBar,
  uid,
} from '../state/defaults'
import { assignSample } from '../state/sampling'
import { useStudio } from '../state/store'
import { selectTrack } from '../state/actions'
import type { EffectParams, EffectType, Pattern, Project, SynthParams, Track } from '../state/types'

export type KitSound = { name: string; kind: DrumKind; params?: Partial<DrumParams> }
export type Hit = number | { step: number; velocity?: number; micro?: number }
/** [pitch, start beat, length beats, velocity] */
export type NoteSpec = [number, number, number, number?]

const SAMPLE_RATE = 44100

/** Renders the sounds back to back into one sample so each pad is one drum. */
function renderKit(sounds: KitSound[]) {
  const parts = sounds.map(sound =>
    renderDrum(sound.kind, { ...DRUM_DEFAULTS[sound.kind], ...sound.params }, SAMPLE_RATE),
  )
  const gap = Math.round(SAMPLE_RATE * 0.01)
  const total = parts.reduce((sum, part) => sum + part.length + gap, 0)
  const data = new Float32Array(total)
  const starts: number[] = []
  let offset = 0
  for (const part of parts) {
    starts.push(offset / SAMPLE_RATE)
    data.set(part, offset)
    offset += part.length + gap
  }
  return { data, starts, duration: total / SAMPLE_RATE }
}

/** Step 1 of every tutorial: a fresh project with one synthesized drum kit. */
export async function startProject(options: {
  name: string
  bpm: number
  swing: number
  kitName: string
  sounds: KitSound[]
  patternName: string
  bars: number
}) {
  await engine.ready()
  const kit = renderKit(options.sounds)
  const bufferId = uid()
  const blob = encodeWav({
    numberOfChannels: 1,
    length: kit.data.length,
    sampleRate: SAMPLE_RATE,
    getChannelData: () => kit.data,
  })
  const base = makeProject()
  const track = makeTrack('drums', options.kitName, 0, bufferId)
  const project: Project = {
    ...base,
    id: uid(),
    name: options.name,
    bpm: options.bpm,
    swing: options.swing,
    tracks: [track],
    patterns: [],
    clips: [],
  }
  project.patterns = [makePattern(project, options.patternName, options.bars)]
  project.loop = { enabled: false, start: 0, end: options.bars * 4 }
  assignSample(project, track.id, bufferId, kit.duration, kit.starts)
  track.pads.forEach((pad, index) => {
    const sound = options.sounds[index % options.sounds.length]
    if (index < options.sounds.length) pad.name = sound.name
  })
  await importProject(JSON.stringify(project), new Map([[bufferId, blob]]))
}

export function requireProject(name: string) {
  const project = useStudio.getState().project
  if (project.name !== name) throw new Error(`Run step 1 first: this step works on the "${name}" project.`)
  return project
}

const trackByName = (project: Project, name: string) => {
  const track = project.tracks.find(item => item.name === name)
  if (!track) throw new Error(`Track "${name}" not found. Run the earlier steps first.`)
  return track
}
const patternByName = (project: Project, name: string) => {
  const pattern = project.patterns.find(item => item.name === name)
  if (!pattern) throw new Error(`Pattern "${name}" not found. Run the earlier steps first.`)
  return pattern
}
const rowFor = (pattern: Pattern, track: Track) => {
  let row = pattern.trackSteps.find(item => item.trackId === track.id)
  if (!row) {
    row = { trackId: track.id, steps: [], notes: [] }
    pattern.trackSteps.push(row)
  }
  return row
}

/** Replace one pad's steps in a pattern with the given hits. */
export function program(
  projectName: string,
  patternName: string,
  trackName: string,
  padIndex: number,
  hits: Hit[],
  label = 'Program drums',
) {
  requireProject(projectName)
  useStudio.getState().edit(label, draft => {
    const track = trackByName(draft, trackName)
    const pattern = patternByName(draft, patternName)
    const pad = track.pads[padIndex]
    const row = rowFor(pattern, track)
    const total = pattern.bars * stepsPerBar(draft)
    while (row.steps.length < total) row.steps.push(makeStep())
    row.steps.forEach((step, index) => {
      if (step.active && (step.padId ?? track.sequencerPadId) === pad.id) row.steps[index] = makeStep()
    })
    for (const hit of hits) {
      const spec = typeof hit === 'number' ? { step: hit } : hit
      if (spec.step < 0 || spec.step >= total) continue
      row.steps[spec.step] = {
        active: true,
        velocity: spec.velocity ?? 0.9,
        microTimingMs: spec.micro ?? 0,
        padId: pad.id,
      }
    }
  })
  selectByName(trackName)
}

export function addSynth(projectName: string, name: string, patch: Partial<SynthParams>, volume = 0.7) {
  requireProject(projectName)
  useStudio.getState().edit(`Add ${name}`, draft => {
    let track = draft.tracks.find(item => item.name === name)
    if (!track) {
      track = makeTrack('synth', name, draft.tracks.length)
      draft.tracks.push(track)
      for (const pattern of draft.patterns)
        pattern.trackSteps.push({
          trackId: track.id,
          steps: Array.from({ length: pattern.bars * stepsPerBar(draft) }, makeStep),
          notes: [],
        })
    }
    track.synth = { ...makeSynth(), ...patch }
    track.volume = volume
  })
  selectByName(name)
}

export function writeNotes(
  projectName: string,
  patternName: string,
  trackName: string,
  notes: NoteSpec[],
  label = 'Write notes',
) {
  requireProject(projectName)
  useStudio.getState().edit(label, draft => {
    const row = rowFor(patternByName(draft, patternName), trackByName(draft, trackName))
    row.notes = notes.map(([pitch, start, length, velocity]) => ({
      id: uid(),
      pitch,
      start,
      length,
      velocity: velocity ?? 0.8,
    }))
  })
  selectByName(trackName)
}

export function addEffect(
  projectName: string,
  trackName: string,
  type: EffectType,
  params: Partial<EffectParams> = {},
) {
  requireProject(projectName)
  useStudio.getState().edit(`Add ${type}`, draft => {
    const track = trackByName(draft, trackName)
    let effect = track.effects.find(item => item.type === type)
    if (!effect) {
      effect = makeEffect(type, true)
      track.effects.push(effect)
    }
    effect.enabled = true
    Object.assign(effect.params, params)
  })
}

export function setMix(projectName: string, trackName: string, volume: number, pan = 0) {
  requireProject(projectName)
  useStudio.getState().edit('Mix', draft => {
    const track = trackByName(draft, trackName)
    track.volume = volume
    track.pan = pan
  })
}

/**
 * Derive section patterns from the main pattern by keeping only some tracks, then lay the
 * sections out back to back on the arrangement.
 */
export function arrange(
  projectName: string,
  mainPattern: string,
  sections: { name: string; keep: string[] | 'all'; repeats: number }[],
) {
  requireProject(projectName)
  useStudio.getState().edit('Arrange song', draft => {
    const main = patternByName(draft, mainPattern)
    const lane = draft.lanes[0]
    draft.clips = draft.clips.filter(clip => clip.laneId !== lane.id)
    let cursor = 0
    for (const section of sections) {
      let pattern = section.keep === 'all' ? main : draft.patterns.find(item => item.name === section.name)
      if (!pattern) {
        pattern = { id: uid(), name: section.name, bars: main.bars, trackSteps: [] }
        draft.patterns.push(pattern)
      }
      if (section.keep !== 'all') {
        const keep = new Set(section.keep.map(name => trackByName(draft, name).id))
        pattern.trackSteps = main.trackSteps.map(row => ({
          trackId: row.trackId,
          steps: row.steps.map(step => (keep.has(row.trackId) ? { ...step } : makeStep())),
          notes: keep.has(row.trackId) ? row.notes.map(note => ({ ...note, id: uid() })) : [],
        }))
      }
      const length = section.repeats * pattern.bars * draft.timeSignature.beats
      draft.clips.push({
        id: uid(),
        kind: 'pattern',
        name: section.name,
        laneId: lane.id,
        start: cursor,
        length,
        muted: false,
        patternId: pattern.id,
      })
      cursor += length
    }
    draft.loop = { enabled: false, start: 0, end: cursor }
  })
}

function selectByName(name: string) {
  const state = useStudio.getState()
  const track = state.project.tracks.find(item => item.name === name)
  if (track) selectTrack(track)
  const main = state.project.patterns[0]
  if (main) useStudio.setState({ patternId: main.id })
}

export const kitIdFor = (projectName: string, trackName: string) =>
  trackByName(requireProject(projectName), trackName).id
