/**
 * One-click mixing moves. Each action is one ordinary undoable edit that creates effects, sends
 * and buses the user can see and change afterwards; nothing here is hidden processing.
 */
import { makeEffect, makeStep, makeTrack, stepsPerBar } from './defaults'
import { notify, useStudio } from './store'
import type { EffectInstance, EffectType, Project, Track } from './types'

export type MixAction = {
  id: string
  label: string
  description: string
  /** false when the project has nothing the action can work on */
  available: (project: Project) => boolean
  apply: (project: Project) => string
}

const isBassName = (name: string) => /bass|808|sub/i.test(name)

/** Lowest-sounding synth or keys track: a bass-ish name wins, else the lowest average note. */
export function findBass(project: Project): Track | undefined {
  const pitched = project.tracks.filter(track => track.kind === 'synth' || track.kind === 'keys')
  const named = pitched.find(track => isBassName(track.name))
  if (named) return named
  const average = (track: Track) => {
    const pitches: number[] = []
    for (const pattern of project.patterns)
      for (const note of pattern.trackSteps.find(row => row.trackId === track.id)?.notes ?? []) pitches.push(note.pitch)
    for (const clip of project.clips)
      if (clip.kind === 'midi' && clip.trackId === track.id) pitches.push(...clip.notes.map(note => note.pitch))
    return pitches.length ? pitches.reduce((sum, pitch) => sum + pitch, 0) / pitches.length : Infinity
  }
  return [...pitched].sort((a, b) => average(a) - average(b)).find(track => average(track) < 55)
}

export const findKick = (project: Project) => project.tracks.find(track => track.kind === 'drums')

/** Synth tracks that play chords (three or more simultaneous notes somewhere). */
export function findChordTracks(project: Project) {
  return project.tracks.filter(track => {
    if (track.kind !== 'synth' && track.kind !== 'keys') return false
    const notes = [
      ...project.patterns.flatMap(pattern => pattern.trackSteps.find(row => row.trackId === track.id)?.notes ?? []),
      ...project.clips.flatMap(clip => (clip.kind === 'midi' && clip.trackId === track.id ? clip.notes : [])),
    ]
    const byStart = new Map<number, number>()
    for (const note of notes) byStart.set(note.start, (byStart.get(note.start) ?? 0) + 1)
    return [...byStart.values()].some(count => count >= 3)
  })
}

const ensureEffect = (
  track: { effects: EffectInstance[] },
  type: EffectType,
  params: Partial<EffectInstance['params']>,
) => {
  let effect = track.effects.find(item => item.type === type && (type !== 'filter' || item.params.mode === params.mode))
  if (!effect) {
    effect = makeEffect(type, true)
    track.effects.push(effect)
  }
  effect.enabled = true
  Object.assign(effect.params, params)
  return effect
}

export const MIX_ACTIONS: MixAction[] = [
  {
    id: 'sidechain',
    label: 'Sidechain bass to kick',
    description: 'Ducks the bass every time the kick hits so the low end never piles up.',
    available: project => Boolean(findKick(project) && findBass(project)),
    apply: project => {
      const kick = findKick(project)!
      const bass = project.tracks.find(track => track.id === findBass(project)!.id)!
      ensureEffect(bass, 'compressor', {
        sidechainTrackId: kick.id,
        threshold: -30,
        ratio: 6,
        attack: 0.004,
        release: 0.16,
        knee: 4,
      })
      return `${bass.name} now ducks under ${kick.name}.`
    },
  },
  {
    id: 'clean-low',
    label: 'Clean the low end',
    description: 'High-passes every track that is not drums or bass at 110 Hz.',
    available: project =>
      project.tracks.some(track => track.kind === 'synth' || track.kind === 'keys' || track.kind === 'audio'),
    apply: project => {
      const bass = findBass(project)
      let count = 0
      for (const track of project.tracks) {
        if (track.kind === 'drums' || track.kind === 'bus' || track.id === bass?.id) continue
        ensureEffect(track, 'filter', { mode: 'highpass', cutoff: 110, q: 0.7, mix: 1 })
        count++
      }
      return `High-passed ${count} track${count === 1 ? '' : 's'} at 110 Hz.`
    },
  },
  {
    id: 'glue-drums',
    label: 'Glue the drums',
    description: 'Routes every drum track into a Drum bus with gentle compression.',
    available: project => project.tracks.some(track => track.kind === 'drums'),
    apply: project => {
      let bus = project.tracks.find(track => track.kind === 'bus' && /drum/i.test(track.name))
      if (!bus) {
        bus = makeTrack('bus', 'Drum bus', project.tracks.length)
        bus.effects = []
        project.tracks.push(bus)
        for (const pattern of project.patterns)
          pattern.trackSteps.push({
            trackId: bus.id,
            steps: Array.from({ length: pattern.bars * stepsPerBar(project) }, makeStep),
            notes: [],
          })
      }
      ensureEffect(bus, 'compressor', {
        threshold: -18,
        ratio: 3,
        attack: 0.01,
        release: 0.2,
        knee: 8,
        sidechainTrackId: '',
      })
      let count = 0
      for (const track of project.tracks)
        if (track.kind === 'drums') {
          track.outputBusId = bus.id
          count++
        }
      return `${count} drum track${count === 1 ? '' : 's'} now run through ${bus.name}.`
    },
  },
  {
    id: 'widen-keys',
    label: 'Widen the chords',
    description: 'Adds a light chorus to tracks that play chords so they sit wider than the bass and drums.',
    available: project => findChordTracks(project).length > 0,
    apply: project => {
      const chordTracks = findChordTracks(project)
      for (const track of chordTracks) ensureEffect(track, 'chorus', { rate: 0.6, depth: 0.004, mix: 0.25 })
      return `Widened ${chordTracks.map(track => track.name).join(', ')}.`
    },
  },
  {
    id: 'loudness',
    label: 'Loudness for streaming',
    description: 'Master limiter set so exports sit around -14 LUFS without clipping.',
    available: () => true,
    apply: project => {
      ensureEffect({ effects: project.masterEffects }, 'limiter', {
        threshold: -6,
        ratio: 20,
        attack: 0.002,
        release: 0.12,
        knee: 2,
      })
      project.masterVolume = Math.max(project.masterVolume, 0.9)
      return 'Master limiter set for streaming loudness. Watch the LUFS readout while the song plays.'
    },
  },
]

export function runMixAction(id: string) {
  const action = MIX_ACTIONS.find(item => item.id === id)
  if (!action) return
  let message = ''
  useStudio.getState().edit(action.label, draft => {
    message = action.apply(draft)
  })
  if (message) notify(message)
}
