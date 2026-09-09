import { engine } from '../audio/engine'
import { stepTime } from '../audio/timing'
import { reportError, useStudio } from './store'
import type { Pad, Track } from './types'

export const padKeys = '1234qwerasdfzxcv'
export function selectTrack(track: Track) {
  useStudio.setState({ selectedTrackId: track.id, selectedPadId: track.pads[0].id })
}
export async function triggerPad(track: Track, pad: Pad) {
  const state = useStudio.getState()
  useStudio.setState({ selectedPadId: pad.id })
  try {
    await engine.hit(state.project, track, pad)
    if (state.recording && engine.playing && !state.songMode) {
      const elapsed = engine.context!.currentTime - engine.origin
      const barLength = 240 / state.project.bpm
      const position = ((elapsed % barLength) + barLength) % barLength
      let nearest = 0
      let distance = Infinity
      for (let index = 0; index <= 16; index++) {
        const delta = Math.abs(stepTime(index, state.project.bpm, state.project.swing) - position)
        if (delta < distance) { distance = delta; nearest = index % 16 }
      }
      state.edit('Record pad', project => {
        const step = project.patterns.find(pattern => pattern.id === state.patternId)?.trackSteps.find(row => row.trackId === track.id)?.steps[nearest]
        if (step) { step.active = true; step.padId = pad.id; step.velocity = 1 }
      })
    }
  } catch (error) { reportError(error) }
}
export async function play(songMode = false) {
  const state = useStudio.getState()
  try {
    await engine.play(() => useStudio.getState().project, state.patternId, songMode)
    useStudio.setState({ playing: engine.playing, songMode, playhead: -1, ...(songMode ? { recording: false } : {}) })
  } catch (error) { reportError(error) }
}
export function stop() {
  engine.stop(); useStudio.setState({ playing: false, recording: false, playhead: -1, sectionId: '' })
}