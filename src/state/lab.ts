import { create } from 'zustand'
import type { LabLayer, LabProcess } from '../audio/render'
import { DRUM_DEFAULTS, type DrumKind } from '../audio/drums'
import { makeEffect, makeSynth, uid } from './defaults'

/**
 * Sound Lab working state. Kept outside the project store: designing a sound is a scratch
 * session, and only the saved result (a library sample or synth patch) becomes durable.
 */
export type LabMode = 'drum' | 'synth' | 'layer'

type LabState = {
  mode: LabMode
  name: string
  layers: LabLayer[]
  process: LabProcess
  selectedLayerId: string
  /** last render, for the waveform and audition */
  rendered?: AudioBuffer
  renderedKey: string
  rendering: boolean
  set: (patch: Partial<LabState>) => void
  updateLayer: (id: string, change: (layer: LabLayer) => LabLayer) => void
  addLayer: (layer: LabLayer) => void
  removeLayer: (id: string) => void
}

export const makeDrumLayer = (drum: DrumKind = 'kick'): LabLayer => ({
  id: uid(),
  kind: 'drum',
  drum,
  params: { ...DRUM_DEFAULTS[drum] },
  gain: 1,
  tune: 0,
  offset: 0,
  mute: false,
})
export const makeSynthLayer = (): LabLayer => ({
  id: uid(),
  kind: 'synth',
  synth: makeSynth(),
  pitch: 48,
  hold: 0.6,
  gain: 1,
  tune: 0,
  offset: 0,
  mute: false,
})
export const makeSampleLayer = (bufferId: string): LabLayer => ({
  id: uid(),
  kind: 'sample',
  bufferId,
  start: 0,
  end: 0,
  reverse: false,
  gain: 1,
  tune: 0,
  offset: 0,
  mute: false,
})

export const defaultProcess = (): LabProcess => ({
  effects: [
    makeEffect('eq'),
    makeEffect('saturation'),
    makeEffect('filter'),
    makeEffect('compressor'),
    makeEffect('reverb'),
  ],
  normalize: true,
  fadeIn: 0,
  fadeOut: 0.01,
  trimSilence: true,
  tail: 0.3,
})

const first = makeDrumLayer('kick')
export const useLab = create<LabState>((set, get) => ({
  mode: 'drum',
  name: 'New kick',
  layers: [first],
  process: defaultProcess(),
  selectedLayerId: first.id,
  rendered: undefined,
  renderedKey: '',
  rendering: false,
  set: patch => set(patch),
  updateLayer: (id, change) => set({ layers: get().layers.map(layer => (layer.id === id ? change(layer) : layer)) }),
  addLayer: layer => set({ layers: [...get().layers, layer], selectedLayerId: layer.id }),
  removeLayer: id => {
    const layers = get().layers.filter(layer => layer.id !== id)
    set({ layers, selectedLayerId: layers[0]?.id ?? '' })
  },
}))
