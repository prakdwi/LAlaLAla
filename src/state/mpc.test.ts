import { beforeEach, expect, it, vi } from 'vitest'
import { useStudio } from './store'
import { makeProject } from './defaults'
import { recordHit } from './actions'
import { padVelocity } from './mpc'
import { assignSample, addPadBank, bankCount, padsInBank } from './sampling'
import { detectSlices, equalSlices } from '../audio/slicing'

vi.mock('../audio/engine', () => ({
  engine: { context: { currentTime: 0 }, positionBeats: () => 0, countingIn: false, buffers: new Map(), events: [] },
  scheduleStep: () => {},
}))

beforeEach(() => useStudio.getState().hydrate(makeProject()))

const activeSteps = () => {
  const state = useStudio.getState()
  const row = state.project.patterns[0].trackSteps[0]
  return row.steps.map((step, index) => (step.active ? index : -1)).filter(index => index >= 0)
}

it('quantizes recorded hits to the chosen grid and keeps microtiming when off', () => {
  const state = useStudio.getState()
  const track = state.project.tracks[0]
  const pad = track.pads[2]
  state.edit('clear', project => project.patterns[0].trackSteps[0].steps.forEach(step => (step.active = false)))
  useStudio.setState(current => ({ mpc: { ...current.mpc, quantize: 0.25 } }))
  recordHit(track, pad, 0.7, 1.3) // beat 1.3 -> sixteenth 5.2 -> step 5
  expect(activeSteps()).toEqual([5])
  expect(useStudio.getState().project.patterns[0].trackSteps[0].steps[5]).toMatchObject({
    padId: pad.id,
    velocity: 0.7,
    microTimingMs: 0,
  })
  useStudio.setState(current => ({ mpc: { ...current.mpc, quantize: 1 } }))
  recordHit(track, pad, 1, 2.4) // quarter grid -> beat 2 -> step 8
  expect(activeSteps()).toEqual([5, 8])
  useStudio.setState(current => ({ mpc: { ...current.mpc, quantize: 0 } }))
  recordHit(track, pad, 1, 3.05) // 12.2 sixteenths -> step 12, +0.2 step late at 92 bpm (~33 ms)
  const step = useStudio.getState().project.patterns[0].trackSteps[0].steps[12]
  expect(step.active).toBe(true)
  expect(step.microTimingMs).toBeGreaterThan(25)
  expect(step.microTimingMs).toBeLessThan(45)
  recordHit(track, pad, 1, 4.1) // wraps past the one-bar pattern -> step 0
  expect(activeSteps()).toEqual([0, 5, 8, 12])
})

it('maps strike position to velocity unless full level is on', () => {
  const element = { getBoundingClientRect: () => ({ top: 100, height: 100 }) } as unknown as Element
  expect(padVelocity({ clientY: 100, currentTarget: element }, false)).toBeCloseTo(0.3)
  expect(padVelocity({ clientY: 200, currentTarget: element }, false)).toBeCloseTo(1)
  expect(padVelocity({ clientY: 100, currentTarget: element }, true)).toBe(1)
})

it('assigns a sample across pads, keeps banks and remaps recorded steps by position', () => {
  const project = makeProject()
  const track = project.tracks[0]
  addPadBank(track, 0.6)
  expect(bankCount(track)).toBe(2)
  expect(padsInBank(track, 1)).toHaveLength(16)
  const oldThird = track.pads[2].id
  project.patterns[0].trackSteps[0].steps[0].padId = oldThird
  assignSample(project, track.id, 'new', 2, [0, 0.5, 1, 1.5])
  expect(track.sampleBufferId).toBe('new')
  expect(track.pads).toHaveLength(32)
  expect(track.pads.slice(0, 5).map(pad => [pad.startTime, pad.endTime])).toEqual([
    [0, 0.5],
    [0.5, 1],
    [1, 1.5],
    [1.5, 2],
    [0, 0.5],
  ])
  expect(project.patterns[0].trackSteps[0].steps[0].padId).toBe(track.pads[2].id)
})

it('chops into equal regions and respects slicing sensitivity', () => {
  expect(equalSlices(2, 4)).toEqual([0, 0.5, 1, 1.5])
  const rate = 1000
  const data = new Float32Array(2000)
  data.fill(0.9, 200, 230)
  data.fill(0.12, 700, 730) // quiet hit
  data.fill(0.9, 1400, 1430)
  const strict = detectSlices(data, rate, 16, 0)
  const loose = detectSlices(data, rate, 16, 1)
  expect(strict.length).toBeLessThan(loose.length)
  expect(loose.length).toBe(4)
})
