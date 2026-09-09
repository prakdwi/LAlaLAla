import { beforeEach, expect, it } from 'vitest'
import { useStudio } from './store'
import { makeProject } from './defaults'

beforeEach(() => useStudio.getState().hydrate(makeProject()))
it('undoes and redoes pad, step, and mixer edits using patches', () => {
  const state = useStudio.getState
  state().edit('Pad trim', project => { project.tracks[0].pads[0].startTime = 0.1 })
  state().edit('Step', project => { project.patterns[0].trackSteps[0].steps[1].active = true })
  state().edit('Volume', project => { project.tracks[0].volume = 0.2 })
  expect(state().past[0].forward[0].path).toContain('startTime')
  state().undo(); expect(state().project.tracks[0].volume).toBe(0.8)
  state().undo(); expect(state().project.patterns[0].trackSteps[0].steps[1].active).toBe(false)
  state().undo(); expect(state().project.tracks[0].pads[0].startTime).toBe(0)
  state().redo(); expect(state().project.tracks[0].pads[0].startTime).toBe(0.1)
  state().edit('New edit', project => { project.bpm = 100 })
  expect(state().future).toHaveLength(0)
})
it('groups continuous fader edits into one reversible command', () => {
  useStudio.getState().edit('Gain', project => { project.tracks[0].volume = 0.6 }, 'gain')
  useStudio.getState().edit('Gain', project => { project.tracks[0].volume = 0.3 }, 'gain')
  expect(useStudio.getState().past).toHaveLength(1)
  useStudio.getState().undo()
  expect(useStudio.getState().project.tracks[0].volume).toBe(0.8)
})