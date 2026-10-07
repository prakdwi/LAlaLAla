import type { EffectInstance, SynthParams } from '../state/types'
import { effectChain } from './effects'
import { synthVoice } from './synth'
import { renderDrum, type DrumKind, type DrumParams } from './drums'
import { encodeWav } from './wav'

/** A Sound Lab layer: one source plus level, tune and offset. */
export type LabLayer =
  | {
      id: string
      kind: 'drum'
      drum: DrumKind
      params: DrumParams
      gain: number
      tune: number
      offset: number
      mute: boolean
    }
  | {
      id: string
      kind: 'synth'
      synth: SynthParams
      pitch: number
      hold: number
      gain: number
      tune: number
      offset: number
      mute: boolean
    }
  | {
      id: string
      kind: 'sample'
      bufferId: string
      start: number
      end: number
      reverse: boolean
      gain: number
      tune: number
      offset: number
      mute: boolean
    }

export type LabProcess = {
  /** master effect chain applied to the mix */
  effects: EffectInstance[]
  normalize: boolean
  fadeIn: number
  fadeOut: number
  trimSilence: boolean
  /** extra seconds after the last layer for reverb/delay tails */
  tail: number
}

const SAMPLE_RATE = 44100

function toBuffer(context: BaseAudioContext, data: Float32Array) {
  const buffer = context.createBuffer(1, data.length, SAMPLE_RATE)
  buffer.copyToChannel(data as Float32Array<ArrayBuffer>, 0)
  return buffer
}

function layerSeconds(layer: LabLayer, buffers: Map<string, AudioBuffer>) {
  const rate = 2 ** (layer.tune / 12)
  if (layer.kind === 'drum')
    return (Math.max(0.08, layer.params.decay * 2.5, layer.params.noiseDecay * 2.5) + 0.05) / rate
  if (layer.kind === 'synth') return layer.hold + layer.synth.release * 1.5 + 0.05
  const buffer = buffers.get(layer.bufferId)
  if (!buffer) return 0
  const end = layer.end > layer.start ? Math.min(layer.end, buffer.duration) : buffer.duration
  return (end - layer.start) / rate
}

/**
 * Renders the layers through the processing chain into one mono/stereo buffer. Pure offline work,
 * so the Lab can re-render on every tweak.
 */
export async function renderLab(layers: LabLayer[], process: LabProcess, buffers: Map<string, AudioBuffer>, bpm = 120) {
  const active = layers.filter(layer => !layer.mute)
  const length = Math.max(0.1, ...active.map(layer => layer.offset + layerSeconds(layer, buffers))) + process.tail
  const context = new OfflineAudioContext(2, Math.ceil(Math.min(30, length) * SAMPLE_RATE), SAMPLE_RATE)
  const chain = effectChain(context, process.effects, bpm)
  const master = context.createGain()
  chain.output.connect(master).connect(context.destination)
  for (const layer of active) {
    const gain = context.createGain()
    gain.gain.value = layer.gain
    gain.connect(chain.input)
    const rate = 2 ** (layer.tune / 12)
    if (layer.kind === 'synth') {
      const voice = synthVoice(context, layer.synth, layer.pitch + layer.tune, layer.offset, 1, layer.hold)
      voice.output.connect(gain)
      continue
    }
    let buffer: AudioBuffer | undefined
    let start = 0
    let duration: number | undefined
    if (layer.kind === 'drum') buffer = toBuffer(context, renderDrum(layer.drum, layer.params, SAMPLE_RATE))
    else {
      const source = buffers.get(layer.bufferId)
      if (!source) continue
      if (layer.reverse) {
        buffer = context.createBuffer(source.numberOfChannels, source.length, source.sampleRate)
        for (let channel = 0; channel < source.numberOfChannels; channel++) {
          const from = source.getChannelData(channel)
          const to = buffer.getChannelData(channel)
          for (let index = 0, last = from.length - 1; index < from.length; index++) to[index] = from[last - index]
        }
        const end = layer.end > layer.start ? Math.min(layer.end, source.duration) : source.duration
        start = source.duration - end
        duration = end - layer.start
      } else {
        buffer = source
        start = layer.start
        duration = (layer.end > layer.start ? Math.min(layer.end, source.duration) : source.duration) - layer.start
      }
    }
    if (!buffer) continue
    const node = context.createBufferSource()
    node.buffer = buffer
    node.playbackRate.value = rate
    node.connect(gain)
    node.start(layer.offset, start, duration)
  }
  const rendered = await context.startRendering()
  return finalize(rendered, process)
}

/** Normalize, trim leading/trailing silence and apply fades. Returns a new buffer. */
export function finalize(rendered: AudioBuffer, process: LabProcess) {
  const channels = rendered.numberOfChannels
  let first = 0
  let last = rendered.length
  if (process.trimSilence) {
    const threshold = 0.002
    first = rendered.length
    last = 0
    for (let channel = 0; channel < channels; channel++) {
      const data = rendered.getChannelData(channel)
      for (let index = 0; index < data.length; index++)
        if (Math.abs(data[index]) > threshold) {
          first = Math.min(first, index)
          break
        }
      for (let index = data.length - 1; index >= 0; index--)
        if (Math.abs(data[index]) > threshold) {
          last = Math.max(last, index + 1)
          break
        }
    }
    if (first >= last) {
      first = 0
      last = rendered.length
    }
    first = Math.max(0, first - Math.round(rendered.sampleRate * 0.002))
    last = Math.min(rendered.length, last + Math.round(rendered.sampleRate * 0.02))
  }
  const length = Math.max(1, last - first)
  const out = new OfflineAudioContext(channels, length, rendered.sampleRate).createBuffer(
    channels,
    length,
    rendered.sampleRate,
  )
  let peak = 0
  for (let channel = 0; channel < channels; channel++) {
    const data = rendered.getChannelData(channel).subarray(first, last)
    for (let index = 0; index < data.length; index++) peak = Math.max(peak, Math.abs(data[index]))
  }
  const gain = process.normalize && peak > 0 ? 0.95 / peak : 1
  const fadeIn = Math.round(process.fadeIn * rendered.sampleRate)
  const fadeOut = Math.round(process.fadeOut * rendered.sampleRate)
  for (let channel = 0; channel < channels; channel++) {
    const data = rendered.getChannelData(channel).subarray(first, last)
    const target = out.getChannelData(channel)
    for (let index = 0; index < length; index++) {
      let env = 1
      if (fadeIn > 0 && index < fadeIn) env *= index / fadeIn
      if (fadeOut > 0 && index > length - fadeOut) env *= (length - index) / fadeOut
      target[index] = data[index] * gain * env
    }
  }
  return out
}

export const bufferToBlob = (buffer: AudioBuffer) => encodeWav(buffer)
