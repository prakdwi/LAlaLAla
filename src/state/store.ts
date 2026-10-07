import { create } from 'zustand'
import { applyPatches, enablePatches, produceWithPatches, type Draft, type Patch } from 'immer'
import type { LibraryItem, Project, ProjectSummary } from './types'
import { makeProject } from './defaults'
import { defaultMpc, type MpcState } from './mpc'

enablePatches()
type Command = { label: string; forward: Patch[]; backward: Patch[]; key?: string; time: number }
export type EditorKind = 'auto' | 'sequencer' | 'piano' | 'audio' | 'automation'

export type StudioState = {
  project: Project
  selectedTrackId: string
  selectedPadId: string
  patternId: string
  selectedClipId: string
  selectedLaneId: string
  editor: EditorKind
  past: Command[]
  future: Command[]
  revision: number
  ready: boolean
  saveStatus: string
  playing: boolean
  recording: boolean
  songMode: boolean
  /** local step of the selected pattern, -1 when idle */
  playhead: number
  /** arrangement position in beats, -1 when idle; negative during count-in */
  positionBeats: number
  flashes: Record<string, number>
  noteFlashes: Record<string, number>
  error: string
  notice: string
  /** timeline zoom in pixels per beat */
  zoom: number
  quantize: boolean
  keyboardOctave: number
  showShortcuts: boolean
  mpc: MpcState
  library: LibraryItem[]
  projects: ProjectSummary[]
  inputArmed: boolean
  recordingAudio: boolean
  inputDevices: { id: string; label: string }[]
  inputDeviceId: string
  midiStatus: 'idle' | 'unsupported' | 'denied' | 'ready'
  midiInputs: { id: string; name: string }[]
  clockKind: 'worklet' | 'interval'
  edit: (label: string, change: (project: Draft<Project>) => void, key?: string) => void
  undo: () => void
  redo: () => void
  hydrate: (project: Project) => void
}

const initial = makeProject()
export const useStudio = create<StudioState>((set, get) => ({
  project: initial,
  selectedTrackId: initial.tracks[0].id,
  selectedPadId: initial.tracks[0].pads[0].id,
  patternId: initial.patterns[0].id,
  selectedClipId: '',
  selectedLaneId: initial.lanes[0].id,
  editor: 'auto',
  past: [],
  future: [],
  revision: 0,
  ready: false,
  saveStatus: 'Loading session',
  playing: false,
  recording: false,
  songMode: false,
  playhead: -1,
  positionBeats: -1,
  flashes: {},
  noteFlashes: {},
  error: '',
  notice: '',
  zoom: 24,
  quantize: true,
  keyboardOctave: 4,
  showShortcuts: false,
  mpc: defaultMpc(),
  library: [],
  projects: [],
  inputArmed: false,
  recordingAudio: false,
  inputDevices: [],
  inputDeviceId: '',
  midiStatus: 'idle',
  midiInputs: [],
  clockKind: 'interval',
  edit: (label, change, key) => {
    const state = get()
    const [project, forward, backward] = produceWithPatches(state.project, draft => {
      change(draft)
      draft.updatedAt = Date.now()
    })
    // only the timestamp changed: nothing to record
    if (forward.every(patch => patch.path.length === 1 && patch.path[0] === 'updatedAt')) return
    const time = Date.now()
    const previous = state.past.at(-1)
    const merge = key && previous?.key === key && time - previous.time < 400
    const command = merge
      ? { label, key, time, forward: [...previous.forward, ...forward], backward: [...backward, ...previous.backward] }
      : { label, key, time, forward, backward }
    set({
      project,
      past: [...(merge ? state.past.slice(0, -1) : state.past).slice(-99), command],
      future: [],
      revision: state.revision + 1,
      saveStatus: 'Saving...',
    })
  },
  undo: () => {
    const state = get()
    const command = state.past.at(-1)
    if (command)
      set({
        project: applyPatches(state.project, command.backward),
        past: state.past.slice(0, -1),
        future: [...state.future, command],
        revision: state.revision + 1,
        saveStatus: 'Saving...',
      })
  },
  redo: () => {
    const state = get()
    const command = state.future.at(-1)
    if (command)
      set({
        project: applyPatches(state.project, command.forward),
        future: state.future.slice(0, -1),
        past: [...state.past, command],
        revision: state.revision + 1,
        saveStatus: 'Saving...',
      })
  },
  hydrate: project =>
    set({
      project,
      selectedTrackId: project.tracks[0].id,
      selectedPadId: project.tracks[0].pads[0]?.id ?? '',
      patternId: project.patterns[0].id,
      selectedClipId: '',
      selectedLaneId: project.lanes[0].id,
      past: [],
      future: [],
      ready: true,
      saveStatus: 'Saved locally',
      playhead: -1,
      positionBeats: -1,
    }),
}))

export function reportError(error: unknown) {
  useStudio.setState({ error: error instanceof Error ? error.message : String(error) })
}
export function notify(notice: string) {
  useStudio.setState({ notice })
  setTimeout(() => {
    if (useStudio.getState().notice === notice) useStudio.setState({ notice: '' })
  }, 4000)
}

export const selectedTrack = (state: StudioState) =>
  state.project.tracks.find(track => track.id === state.selectedTrackId) ?? state.project.tracks[0]
export const selectedClip = (state: StudioState) => state.project.clips.find(clip => clip.id === state.selectedClipId)
export const currentPattern = (state: StudioState) =>
  state.project.patterns.find(pattern => pattern.id === state.patternId) ?? state.project.patterns[0]
