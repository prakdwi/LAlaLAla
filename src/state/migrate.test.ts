import { expect, it } from 'vitest'
import { migrateProject } from './migrate'
import { makeProject } from './defaults'
import { SCHEMA_VERSION } from './types'

const legacy = () => ({
  id: 'p1',
  name: 'Old song',
  bpm: 100,
  swing: 0.1,
  masterVolume: 0.8,
  tracks: [
    {
      id: 't1',
      name: 'Kick',
      sampleBufferId: 'factory-0',
      pads: [
        {
          id: 'pad1',
          startTime: 0,
          endTime: 0.5,
          gain: 1,
          pan: 0,
          pitchSemitones: 0,
          loop: false,
          chokeGroup: 0,
          attack: 0.002,
          release: 0.01,
          effects: [],
        },
      ],
      volume: 0.8,
      pan: 0,
      mute: false,
      solo: false,
      effects: [
        {
          id: 'fx1',
          type: 'filter',
          enabled: true,
          params: { cutoff: 800, q: 2, mode: 'lowpass', division: 0.5, feedback: 0.3, mix: 0.3 },
        },
      ],
      sequencerPadId: 'pad1',
    },
  ],
  patterns: [
    {
      id: 'pa',
      name: 'Pattern A',
      trackSteps: [
        {
          trackId: 't1',
          steps: Array.from({ length: 16 }, (_, i) => ({ active: i % 4 === 0, velocity: 1, microTimingMs: 0 })),
        },
      ],
    },
  ],
  song: [
    { id: 's1', name: 'Intro', patternId: 'pa', repeatCount: 2 },
    { id: 's2', name: 'Drop', patternId: 'pa', repeatCount: 4 },
  ],
})

it('upgrades a v0 project: sections become sequential pattern clips and defaults are filled', () => {
  const project = migrateProject(legacy())
  expect(project.schemaVersion).toBe(SCHEMA_VERSION)
  expect(project.clips.map(clip => [clip.name, clip.start, clip.length])).toEqual([
    ['Intro', 0, 8],
    ['Drop', 8, 16],
  ])
  expect(project.tracks[0].kind).toBe('drums')
  expect(project.tracks[0].effects[0].params).toMatchObject({ cutoff: 800, q: 2, threshold: -18, drive: 0.4 })
  expect(project.patterns[0].bars).toBe(1)
  expect(project.lanes).toHaveLength(1)
  expect('song' in project).toBe(false)
  expect(project.loop.end).toBe(24)
})

it('is idempotent on current projects and rejects garbage', () => {
  const current = makeProject()
  const again = migrateProject(JSON.parse(JSON.stringify(current)))
  expect(again.clips).toEqual(current.clips)
  expect(() => migrateProject('nope')).toThrow()
  expect(() => migrateProject({ tracks: [] })).toThrow()
  expect(() => migrateProject({ ...current, schemaVersion: 99 })).toThrow(/newer/)
})

it('pads short pattern rows to the pattern length and drops rows for missing tracks', () => {
  const current = makeProject()
  current.patterns[0].bars = 2
  current.patterns[0].trackSteps[0].steps.length = 4
  current.patterns[0].trackSteps.push({ trackId: 'ghost', steps: [] })
  const project = migrateProject(current)
  expect(project.patterns[0].trackSteps.every(row => row.steps.length === 32)).toBe(true)
  expect(project.patterns[0].trackSteps.some(row => row.trackId === 'ghost')).toBe(false)
})
