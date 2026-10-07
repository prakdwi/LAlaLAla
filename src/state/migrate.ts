import { SCHEMA_VERSION, type Clip, type Project } from './types'
import { defaultEffectParams, makeEffect, TRACK_COLORS, uid } from './defaults'

/**
 * Upgrades a stored or imported project to the current schema. Each step is pure and idempotent.
 * Unknown input shapes throw so a bad import never half-hydrates the store.
 */
export function migrateProject(input: unknown): Project {
  if (!input || typeof input !== 'object') throw new Error('Project file is not an object.')
  let project = structuredClone(input) as Record<string, unknown>
  const version = typeof project.schemaVersion === 'number' ? project.schemaVersion : 0
  if (version > SCHEMA_VERSION) throw new Error(`This project was saved by a newer version (schema ${version}).`)
  if (version < 1) project = v0ToV1(project)
  if (version < 2) project = v1ToV2(project)
  if (version < 3) project = v2ToV3(project)
  return validate(project as unknown as Project)
}

/** v0: the original one-bar sampler. song sections become pattern clips on a single lane. */
function v0ToV1(project: Record<string, unknown>) {
  const tracks = Array.isArray(project.tracks) ? (project.tracks as Record<string, unknown>[]) : []
  const patterns = Array.isArray(project.patterns) ? (project.patterns as Record<string, unknown>[]) : []
  const song = Array.isArray(project.song) ? (project.song as Record<string, unknown>[]) : []
  const timeSignature = { beats: 4, unit: 4 }
  const lane = { id: uid(), name: 'Patterns' }
  const clips: Clip[] = []
  let cursor = 0
  for (const section of song) {
    const pattern = patterns.find(item => item.id === section.patternId)
    if (!pattern) continue
    const repeats = Math.max(1, Number(section.repeatCount) || 1)
    const length = repeats * timeSignature.beats
    clips.push({
      id: String(section.id ?? uid()),
      kind: 'pattern',
      name: String(section.name ?? 'Section'),
      laneId: lane.id,
      start: cursor,
      length,
      muted: false,
      patternId: String(pattern.id),
    })
    cursor += length
  }
  const now = Date.now()
  const { song: _song, ...rest } = project
  return {
    ...rest,
    schemaVersion: 1,
    tracks: tracks.map((track, index) => ({
      kind: 'drums',
      color: TRACK_COLORS[index % TRACK_COLORS.length],
      rootNote: 60,
      sends: [],
      ...track,
      effects: Array.isArray(track.effects)
        ? (track.effects as Record<string, unknown>[]).map(effect => ({
            ...effect,
            params: { ...defaultEffectParams(), ...(effect.params as object) },
          }))
        : [],
    })),
    patterns: patterns.map(pattern => ({ bars: 1, ...pattern })),
    lanes: [lane],
    clips,
    masterEffects: [makeEffect('limiter', true)],
    timeSignature,
    loop: { enabled: false, start: 0, end: Math.max(timeSignature.beats, cursor) },
    metronome: false,
    countInBars: 0,
    createdAt: now,
    updatedAt: now,
  }
}

/** v2: pads gain reverse and mute flags. */
function v1ToV2(project: Record<string, unknown>) {
  const tracks = Array.isArray(project.tracks) ? (project.tracks as Record<string, unknown>[]) : []
  for (const track of tracks) {
    if (Array.isArray(track.pads))
      for (const pad of track.pads as Record<string, unknown>[]) {
        pad.reverse ??= false
        pad.mute ??= false
      }
  }
  return { ...project, schemaVersion: 2 }
}

/** v3: pattern rows carry polyphonic pitched notes. */
function v2ToV3(project: Record<string, unknown>) {
  const patterns = Array.isArray(project.patterns) ? (project.patterns as Record<string, unknown>[]) : []
  for (const pattern of patterns)
    if (Array.isArray(pattern.trackSteps))
      for (const row of pattern.trackSteps as Record<string, unknown>[]) row.notes ??= []
  return { ...project, schemaVersion: 3 }
}

function validate(project: Project): Project {
  if (!Array.isArray(project.tracks) || !Array.isArray(project.patterns))
    throw new Error('Project is missing tracks or patterns.')
  if (!project.tracks.length) throw new Error('Project has no tracks.')
  if (!project.patterns.length) throw new Error('Project has no patterns.')
  project.id ||= uid()
  project.name ||= 'Untitled'
  project.lanes = project.lanes?.length ? project.lanes : [{ id: uid(), name: 'Patterns' }]
  project.clips ??= []
  project.masterEffects ??= []
  project.timeSignature ??= { beats: 4, unit: 4 }
  project.loop ??= { enabled: false, start: 0, end: 16 }
  project.metronome ??= false
  project.countInBars ??= 0
  project.createdAt ??= Date.now()
  project.updatedAt ??= Date.now()
  project.bpm = Math.max(40, Math.min(240, Number(project.bpm) || 120))
  project.swing = Math.max(0, Math.min(1, Number(project.swing) || 0))
  project.masterVolume = Math.max(0, Math.min(1.2, Number(project.masterVolume) || 0.8))
  for (const track of project.tracks) {
    track.pads ??= []
    track.effects ??= []
    track.sends ??= []
    track.kind ??= 'drums'
    track.rootNote ??= 60
    for (const pad of track.pads) {
      pad.reverse ??= false
      pad.mute ??= false
    }
    for (const effect of [...track.effects, ...track.pads.flatMap(pad => pad.effects ?? [])]) {
      effect.params = { ...defaultEffectParams(), ...effect.params }
    }
  }
  const perBar = project.timeSignature.beats * 4
  for (const pattern of project.patterns) {
    pattern.bars = Math.max(1, Math.round(pattern.bars || 1))
    for (const track of project.tracks) {
      let row = pattern.trackSteps.find(item => item.trackId === track.id)
      if (!row) {
        row = { trackId: track.id, steps: [], notes: [] }
        pattern.trackSteps.push(row)
      }
      row.notes ??= []
      const wanted = pattern.bars * perBar
      while (row.steps.length < wanted) row.steps.push({ active: false, velocity: 1, microTimingMs: 0 })
      if (row.steps.length > wanted) row.steps.length = wanted
    }
    pattern.trackSteps = pattern.trackSteps.filter(row => project.tracks.some(track => track.id === row.trackId))
  }
  project.clips = project.clips.filter(clip => project.lanes.some(lane => lane.id === clip.laneId))
  project.schemaVersion = SCHEMA_VERSION
  return project
}
