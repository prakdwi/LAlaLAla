import { expect, it } from 'vitest'
import { makeProject, makePattern } from './defaults'
import { appendPatternClip, arrangementEnd, duplicateClip, patternStepsAt, snapBeat, splitClip } from './arrangement'
import { automationValueAt, automatedTargets } from './automation'
import type { AutomationClip, MidiClip } from './types'

it('resolves which pattern plays at a global step, including looping inside long clips', () => {
  const project = makeProject()
  const two = makePattern(project, 'Two bars', 2)
  project.patterns.push(two)
  project.clips = [
    {
      id: 'c1',
      kind: 'pattern',
      name: 'A',
      laneId: project.lanes[0].id,
      start: 0,
      length: 4,
      muted: false,
      patternId: project.patterns[0].id,
    },
    {
      id: 'c2',
      kind: 'pattern',
      name: 'B',
      laneId: project.lanes[0].id,
      start: 4,
      length: 16,
      muted: false,
      patternId: two.id,
    },
  ]
  expect(patternStepsAt(project, 0)).toMatchObject([{ patternId: project.patterns[0].id, localStep: 0 }])
  expect(patternStepsAt(project, 15)).toMatchObject([{ patternId: project.patterns[0].id, localStep: 15 }])
  expect(patternStepsAt(project, 16)).toMatchObject([{ patternId: two.id, localStep: 0 }])
  expect(patternStepsAt(project, 16 + 33)).toMatchObject([{ patternId: two.id, localStep: 1 }])
  expect(patternStepsAt(project, 80)).toEqual([])
  expect(arrangementEnd(project)).toBe(20)
  project.clips[1].muted = true
  expect(patternStepsAt(project, 16)).toEqual([])
})

it('appends clips after the last one on the lane and snaps to the grid', () => {
  const project = makeProject()
  const id = appendPatternClip(project, project.patterns[0].id, '', 2)
  const clip = project.clips.find(item => item.id === id)!
  expect(clip.start).toBe(24)
  expect(clip.length).toBe(8)
  expect(clip.name).toBe('Pattern A')
  expect(snapBeat(3.3, 0.25)).toBe(3.25)
  expect(snapBeat(3.3, 0)).toBe(3.3)
})

it('splits and duplicates midi clips, re-timing their notes', () => {
  const project = makeProject()
  const clip: MidiClip = {
    id: 'm',
    kind: 'midi',
    name: 'Lead',
    laneId: project.lanes[0].id,
    start: 4,
    length: 8,
    muted: false,
    trackId: project.tracks[3].id,
    loopLength: 8,
    notes: [
      { id: 'n1', pitch: 60, start: 1, length: 1, velocity: 1 },
      { id: 'n2', pitch: 64, start: 6, length: 1, velocity: 1 },
    ],
  }
  project.clips.push(clip)
  const rightId = splitClip(project, 'm', 8)!
  const right = project.clips.find(item => item.id === rightId) as MidiClip
  expect(clip.length).toBe(4)
  expect(clip.notes.map(note => note.id)).toEqual(['n1'])
  expect(right.start).toBe(8)
  expect(right.notes[0]).toMatchObject({ pitch: 64, start: 2 })
  const copyId = duplicateClip(project, rightId)!
  const copy = project.clips.find(item => item.id === copyId) as MidiClip
  expect(copy.start).toBe(12)
  expect(copy.notes[0].id).not.toBe(right.notes[0].id)
})

it('interpolates automation and reports automated targets', () => {
  const project = makeProject()
  const clip: AutomationClip = {
    id: 'a',
    kind: 'automation',
    name: 'Vol',
    laneId: project.lanes[0].id,
    start: 4,
    length: 8,
    muted: false,
    target: { kind: 'track', trackId: project.tracks[0].id, param: 'volume' },
    points: [
      { beat: 0, value: 0 },
      { beat: 4, value: 1 },
    ],
  }
  project.clips.push(clip)
  expect(automationValueAt(clip, 3.9)).toBeUndefined()
  expect(automationValueAt(clip, 4)).toBe(0)
  expect(automationValueAt(clip, 6)).toBeCloseTo(0.5)
  expect(automationValueAt(clip, 10)).toBe(1)
  expect(automationValueAt(clip, 12)).toBeUndefined()
  expect(automatedTargets(project).has(`track:${project.tracks[0].id}:volume`)).toBe(true)
})
