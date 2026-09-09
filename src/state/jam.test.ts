import { expect, it } from 'vitest'
import { addJamToSong, createJamPattern, parseYouTubeUrl } from './jam'
import { makeProject } from './defaults'
import { useStudio } from './store'

it('accepts official YouTube URL formats and parses start times', () => {
  for (const url of ['https://www.youtube.com/watch?v=jfKfPfyJRdk', 'https://youtu.be/jfKfPfyJRdk', 'https://youtube.com/shorts/jfKfPfyJRdk', 'https://youtube.com/live/jfKfPfyJRdk']) {
    expect(parseYouTubeUrl(url)?.videoId).toBe('jfKfPfyJRdk')
  }
  expect(parseYouTubeUrl('https://youtu.be/jfKfPfyJRdk?t=1m30s')?.start).toBe(90)
  expect(parseYouTubeUrl('https://youtube.com/watch?v=jfKfPfyJRdk&start=42')?.start).toBe(42)
  for (const url of ['javascript:alert(1)', 'https://youtube.com.evil.test/watch?v=jfKfPfyJRdk', 'https://example.com/jfKfPfyJRdk', 'not a url']) expect(parseYouTubeUrl(url)).toBeNull()
})

it('copies a Jam take to the arrangement without aliasing its steps', () => {
  const project = makeProject()
  const id = createJamPattern(project)
  expect(() => addJamToSong(project, id, 'Take', 2)).toThrow('Record pads')
  const source = project.patterns.at(-1)!
  source.trackSteps[0].steps[0] = { active: true, velocity: 0.8, microTimingMs: 12, padId: project.tracks[0].pads[3].id }
  addJamToSong(project, id, 'My take', 3)
  source.trackSteps[0].steps[0].active = false
  expect(project.patterns.at(-1)!.trackSteps[0].steps[0]).toMatchObject({ active: true, velocity: 0.8, microTimingMs: 12 })
  expect(project.song.at(-1)).toMatchObject({ name: 'My take', repeatCount: 3, patternId: project.patterns.at(-1)!.id })
})

it('undoes and redoes the pattern and song section together', () => {
  useStudio.getState().hydrate(makeProject())
  const original = useStudio.getState().project
  useStudio.getState().edit('Add Jam to song', project => { addJamToSong(project, project.patterns[0].id, 'Take', 2) })
  expect(useStudio.getState().project.song).toHaveLength(original.song.length + 1)
  useStudio.getState().undo()
  expect(useStudio.getState().project.patterns).toHaveLength(original.patterns.length)
  expect(useStudio.getState().project.song).toHaveLength(original.song.length)
  useStudio.getState().redo()
  expect(useStudio.getState().project.song.at(-1)?.name).toBe('Take')
})