import { create } from 'zustand'
import { applyPatches, enablePatches, produceWithPatches, type Draft, type Patch } from 'immer'
import type { Project } from './types'
import { makeProject } from './defaults'

enablePatches()
type Command = { label: string; forward: Patch[]; backward: Patch[]; key?: string; time: number }
type StudioState = {
  project: Project; selectedTrackId: string; selectedPadId: string; patternId: string
  past: Command[]; future: Command[]; revision: number; ready: boolean; saveStatus: string
  playing: boolean; recording: boolean; songMode: boolean; playhead: number; sectionId: string
  flashes: Record<string, number>; error: string
  edit: (label: string, change: (project: Draft<Project>) => void, key?: string) => void
  undo: () => void; redo: () => void
  hydrate: (project: Project) => void
}
const initial = makeProject()
export const useStudio = create<StudioState>((set, get) => ({
  project: initial, selectedTrackId: initial.tracks[0].id, selectedPadId: initial.tracks[0].pads[0].id,
  patternId: initial.patterns[0].id, past: [], future: [], revision: 0, ready: false,
  saveStatus: 'Loading session', playing: false, recording: false, songMode: false,
  playhead: -1, sectionId: '', flashes: {}, error: '',
  edit: (label, change, key) => {
    const state = get()
    const [project, forward, backward] = produceWithPatches(state.project, change)
    if (!forward.length) return
    const time = Date.now()
    const previous = state.past.at(-1)
    const merge = key && previous?.key === key && time - previous.time < 400
    const command = merge ? { label, key, time, forward: [...previous.forward, ...forward], backward: [...backward, ...previous.backward] }
      : { label, key, time, forward, backward }
    set({ project, past: [...(merge ? state.past.slice(0, -1) : state.past).slice(-99), command], future: [], revision: state.revision + 1, saveStatus: 'Saving...' })
  },
  undo: () => {
    const state = get(); const command = state.past.at(-1)
    if (command) set({ project: applyPatches(state.project, command.backward), past: state.past.slice(0, -1), future: [...state.future, command], revision: state.revision + 1, saveStatus: 'Saving...' })
  },
  redo: () => {
    const state = get(); const command = state.future.at(-1)
    if (command) set({ project: applyPatches(state.project, command.forward), future: state.future.slice(0, -1), past: [...state.past, command], revision: state.revision + 1, saveStatus: 'Saving...' })
  },
  hydrate: project => set({ project, selectedTrackId: project.tracks[0].id, selectedPadId: project.tracks[0].pads[0].id,
    patternId: project.patterns[0].id, past: [], future: [], ready: true, saveStatus: 'Saved locally' }),
}))

export function reportError(error: unknown) {
  useStudio.setState({ error: error instanceof Error ? error.message : String(error) })
}