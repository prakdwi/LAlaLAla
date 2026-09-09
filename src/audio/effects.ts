import type { EffectInstance } from '../state/types'

export type EffectChain = { input: AudioNode; output: AudioNode; dispose: () => void; update: (effects: EffectInstance[], bpm: number) => void }
const impulses = new WeakMap<BaseAudioContext, AudioBuffer>()
export function createEffect(context: BaseAudioContext, effect: EffectInstance, bpm: number): EffectChain {
  const input = context.createGain()
  const output = context.createGain()
  const bypass = context.createGain()
  const active = context.createGain()
  input.connect(bypass).connect(output)
  input.connect(active)
  const nodes: AudioNode[] = [input, output, bypass, active]
  const smooth = (param: AudioParam, value: number) => param.setTargetAtTime(value, context.currentTime, 0.01)
  let updateParams = (_effect: EffectInstance, _bpm: number) => {}
  if (effect.type === 'filter') {
    const filter = context.createBiquadFilter()
    active.connect(filter).connect(output)
    updateParams = current => {
      filter.type = current.params.mode
      smooth(filter.frequency, current.params.cutoff)
      smooth(filter.Q, current.params.q)
    }
    nodes.push(filter)
  } else {
    const dry = context.createGain()
    const wet = context.createGain()
    active.connect(dry).connect(output)
    wet.connect(output)
    nodes.push(dry, wet)
    const mix = (current: EffectInstance) => { smooth(dry.gain, 1 - current.params.mix); smooth(wet.gain, current.params.mix) }
    updateParams = mix
    if (effect.type === 'delay') {
      const delay = context.createDelay(8)
      const feedback = context.createGain()
      active.connect(delay).connect(wet)
      delay.connect(feedback).connect(delay)
      updateParams = (current, tempo) => {
        mix(current)
        smooth(delay.delayTime, 60 / tempo * current.params.division)
        smooth(feedback.gain, Math.min(0.85, current.params.feedback))
      }
      nodes.push(delay, feedback)
    } else if (effect.type === 'reverb') {
      const reverb = context.createConvolver()
      let impulse = impulses.get(context)
      if (!impulse) {
        impulse = context.createBuffer(2, context.sampleRate * 2, context.sampleRate)
        let seed = 12345
        for (let channel = 0; channel < 2; channel++) {
          const data = impulse.getChannelData(channel)
          for (let index = 0; index < data.length; index++) {
            seed = (seed * 16807) % 2147483647
            data[index] = (seed / 2147483647 * 2 - 1) * Math.pow(1 - index / data.length, 3)
          }
        }
        impulses.set(context, impulse)
      }
      reverb.buffer = impulse
      active.connect(reverb).connect(wet)
      nodes.push(reverb)
    } else {
      const shaper = context.createWaveShaper()
      const curve = new Float32Array(4096)
      for (let index = 0; index < curve.length; index++) curve[index] = Math.round((index / 2047.5 - 1) * 16) / 16
      shaper.curve = curve
      active.connect(shaper).connect(wet)
      nodes.push(shaper)
    }
  }
  const update = ([current]: EffectInstance[], tempo: number) => {
    smooth(bypass.gain, current.enabled ? 0 : 1)
    smooth(active.gain, current.enabled ? 1 : 0)
    updateParams(current, tempo)
  }
  bypass.gain.value = effect.enabled ? 0 : 1
  active.gain.value = effect.enabled ? 1 : 0
  update([effect], bpm)
  return { input, output, update, dispose: () => nodes.forEach(node => node.disconnect()) }
}

export function effectChain(context: BaseAudioContext, effects: EffectInstance[], bpm: number): EffectChain {
  const input = context.createGain()
  let output: AudioNode = input
  const chains = effects.map(effect => createEffect(context, effect, bpm))
  for (const chain of chains) { output.connect(chain.input); output = chain.output }
  return { input, output, update: (current, tempo) => chains.forEach((chain, index) => chain.update([current[index]], tempo)), dispose: () => { input.disconnect(); chains.forEach(chain => chain.dispose()) } }
}