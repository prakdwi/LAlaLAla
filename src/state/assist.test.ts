import { expect, it } from 'vitest'
import { makeProject, makeTrack, makeStep, stepsPerBar } from './defaults'
import { findBass, findChordTracks, findKick, MIX_ACTIONS } from './mixAssistant'
import { buildSong, STRUCTURES, trackRoles } from './songBuilder'
import type { PatternClip, Project } from './types'

function projectWithBand(): Project {
  const project = makeProject()
  const addSynth = (name: string, notes: [number, number][]) => {
    const track = makeTrack('synth', name, project.tracks.length)
    project.tracks.push(track)
    for (const pattern of project.patterns)
      pattern.trackSteps.push({
        trackId: track.id,
        steps: Array.from({ length: pattern.bars * stepsPerBar(project) }, makeStep),
        notes: notes.map(([pitch, start], index) => ({
          id: `n${name}${index}`,
          pitch,
          start,
          length: 1,
          velocity: 0.8,
        })),
      })
    return track
  }
  const chords = addSynth('Chords', [
    [60, 0],
    [64, 0],
    [67, 0],
  ])
  const bass = addSynth('Low thing', [
    [36, 0],
    [38, 2],
  ])
  const lead = addSynth('Lead', [[79, 1]])
  return Object.assign(project, { chords, bass, lead })
}

it('finds the kick, the bass and the chord tracks', () => {
  const project = projectWithBand()
  expect(findKick(project)?.name).toBe('Kick')
  expect(findBass(project)?.name).toBe('Low thing')
  expect(findChordTracks(project).map(track => track.name)).toEqual(['Chords'])
  const named = makeProject()
  const synth = makeTrack('synth', '808 Bass', 4)
  named.tracks.push(synth)
  expect(findBass(named)?.id).toBe(synth.id)
})

it('mix actions create visible effects, routing and a drum bus', () => {
  const project = projectWithBand()
  const action = (id: string) => MIX_ACTIONS.find(item => item.id === id)!
  expect(action('sidechain').available(project)).toBe(true)
  action('sidechain').apply(project)
  const bass = project.tracks.find(track => track.name === 'Low thing')!
  const compressor = bass.effects.find(effect => effect.type === 'compressor')!
  expect(compressor.enabled).toBe(true)
  expect(compressor.params.sidechainTrackId).toBe(project.tracks[0].id)

  action('clean-low').apply(project)
  const keys = project.tracks.find(track => track.name === 'Chords')!
  expect(
    keys.effects.some(effect => effect.type === 'filter' && effect.enabled && effect.params.mode === 'highpass'),
  ).toBe(true)
  expect(
    bass.effects.some(effect => effect.type === 'filter' && effect.enabled && effect.params.mode === 'highpass'),
  ).toBe(false)

  action('glue-drums').apply(project)
  const bus = project.tracks.find(track => track.kind === 'bus')!
  expect(bus.name).toBe('Drum bus')
  expect(project.tracks.filter(track => track.kind === 'drums').every(track => track.outputBusId === bus.id)).toBe(true)
  expect(project.patterns[0].trackSteps.some(row => row.trackId === bus.id)).toBe(true)
  action('glue-drums').apply(project)
  expect(project.tracks.filter(track => track.kind === 'bus')).toHaveLength(1)

  action('widen-keys').apply(project)
  expect(keys.effects.some(effect => effect.type === 'chorus' && effect.enabled)).toBe(true)
  action('loudness').apply(project)
  expect(project.masterEffects.find(effect => effect.type === 'limiter')?.params.threshold).toBe(-6)
})

it('the song builder lays sections out with derived patterns and markers', () => {
  const project = projectWithBand()
  const roles = trackRoles(project)
  expect(roles.get(project.tracks.find(track => track.name === 'Chords')!.id)).toBe('chords')
  expect(roles.get(project.tracks.find(track => track.name === 'Lead')!.id)).toBe('lead')
  expect(roles.get(project.tracks[0].id)).toBe('drums')
  const pop = STRUCTURES.find(structure => structure.id === 'pop')!
  const end = buildSong(project, pop, project.patterns[0].id)
  expect(project.clips).toHaveLength(pop.sections.length)
  expect(project.markers.map(marker => marker.name)).toEqual(pop.sections.map(section => section.name))
  expect(project.markers[1].beat).toBe(16)
  expect(end).toBe(pop.sections.reduce((sum, section) => sum + section.bars * 4, 0))
  // the intro keeps only chords: the drum rows are silent, the Keys notes survive
  const intro = project.patterns.find(pattern => pattern.id === (project.clips[0] as PatternClip).patternId)!
  const drumRow = intro.trackSteps.find(row => row.trackId === project.tracks[0].id)!
  expect(drumRow.steps.every(step => !step.active)).toBe(true)
  const keysRow = intro.trackSteps.find(
    row => row.trackId === project.tracks.find(track => track.name === 'Chords')!.id,
  )!
  expect(keysRow.notes).toHaveLength(3)
  // verse and verse 2 share one derived pattern
  const clips = project.clips as PatternClip[]
  expect(clips[1].patternId).toBe(clips[3].patternId)
  expect(clips[2].patternId).toBe(project.patterns[0].id)
})
