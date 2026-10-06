import type { EffectInstance, EffectParams } from '../state/types'

export type EffectChain = {
  input: AudioNode
  output: AudioNode
  dispose: () => void
  update: (effects: EffectInstance[], bpm: number, time?: number) => void
  /** Smoothly move one numeric parameter at `time`; used by automation. */
  setParam: (effectId: string, param: keyof EffectParams, value: number, time: number) => void
  /** Sidechain hook: duck compressors that listen to `sourceTrackId`. */
  duck: (sourceTrackId: string, time: number, velocity: number) => void
}

const impulses = new WeakMap<BaseAudioContext, AudioBuffer>()
const curves = new Map<string, Float32Array<ArrayBuffer>>()

function impulse(context: BaseAudioContext) {
  let buffer = impulses.get(context)
  if (!buffer) {
    buffer = context.createBuffer(2, context.sampleRate * 2, context.sampleRate)
    let seed = 12345
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel)
      for (let index = 0; index < data.length; index++) {
        seed = (seed * 16807) % 2147483647
        data[index] = ((seed / 2147483647) * 2 - 1) * Math.pow(1 - index / data.length, 3)
      }
    }
    impulses.set(context, buffer)
  }
  return buffer
}

function curve(kind: 'bitcrush' | 'saturation', drive = 0) {
  const key = `${kind}-${drive.toFixed(2)}`
  let result = curves.get(key)
  if (!result) {
    result = new Float32Array(new ArrayBuffer(4096 * 4))
    for (let index = 0; index < result.length; index++) {
      const x = index / 2047.5 - 1
      result[index] =
        kind === 'bitcrush' ? Math.round(x * 16) / 16 : Math.tanh(x * (1 + drive * 12)) / Math.tanh(1 + drive * 12)
    }
    curves.set(key, result)
  }
  return result
}

export function createEffect(context: BaseAudioContext, effect: EffectInstance, bpm: number): EffectChain {
  const input = context.createGain()
  const output = context.createGain()
  const bypass = context.createGain()
  const active = context.createGain()
  input.connect(bypass).connect(output)
  input.connect(active)
  const nodes: AudioNode[] = [input, output, bypass, active]
  const smooth = (param: AudioParam, value: number, time: number) => {
    if (!Number.isFinite(value)) return
    param.setTargetAtTime(value, Math.max(time, context.currentTime), 0.01)
  }
  let updateParams = (_params: EffectParams, _bpm: number, _time: number) => {}
  let duckNode: GainNode | undefined
  let current: EffectInstance = structuredClone(effect)

  const wetDry = () => {
    const dry = context.createGain()
    const wet = context.createGain()
    active.connect(dry).connect(output)
    wet.connect(output)
    nodes.push(dry, wet)
    return (params: EffectParams, time: number) => {
      smooth(dry.gain, 1 - params.mix, time)
      smooth(wet.gain, params.mix, time)
      return wet
    }
  }

  switch (effect.type) {
    case 'filter': {
      const filter = context.createBiquadFilter()
      active.connect(filter).connect(output)
      nodes.push(filter)
      updateParams = (params, _bpm, time) => {
        filter.type = params.mode
        smooth(filter.frequency, params.cutoff, time)
        smooth(filter.Q, params.q, time)
      }
      break
    }
    case 'eq': {
      const low = context.createBiquadFilter()
      const mid = context.createBiquadFilter()
      const high = context.createBiquadFilter()
      low.type = 'lowshelf'
      low.frequency.value = 200
      mid.type = 'peaking'
      mid.Q.value = 1
      high.type = 'highshelf'
      high.frequency.value = 4000
      active.connect(low).connect(mid).connect(high).connect(output)
      nodes.push(low, mid, high)
      updateParams = (params, _bpm, time) => {
        smooth(low.gain, params.lowGain, time)
        smooth(mid.gain, params.midGain, time)
        smooth(mid.frequency, params.midFreq, time)
        smooth(high.gain, params.highGain, time)
      }
      break
    }
    case 'compressor':
    case 'limiter': {
      const compressor = context.createDynamicsCompressor()
      duckNode = context.createGain()
      active.connect(compressor).connect(duckNode).connect(output)
      nodes.push(compressor, duckNode)
      const limiter = effect.type === 'limiter'
      updateParams = (params, _bpm, time) => {
        smooth(compressor.threshold, params.threshold, time)
        smooth(compressor.ratio, limiter ? 20 : params.ratio, time)
        smooth(compressor.attack, limiter ? 0.002 : params.attack, time)
        smooth(compressor.release, limiter ? 0.08 : params.release, time)
        smooth(compressor.knee, limiter ? 0 : params.knee, time)
      }
      break
    }
    case 'delay': {
      const mix = wetDry()
      const delay = context.createDelay(8)
      const feedback = context.createGain()
      active.connect(delay)
      delay.connect(feedback).connect(delay)
      nodes.push(delay, feedback)
      let wired = false
      updateParams = (params, tempo, time) => {
        const wet = mix(params, time)
        if (!wired) {
          delay.connect(wet)
          wired = true
        }
        smooth(delay.delayTime, (60 / tempo) * params.division, time)
        smooth(feedback.gain, Math.min(0.85, params.feedback), time)
      }
      break
    }
    case 'reverb': {
      const mix = wetDry()
      const reverb = context.createConvolver()
      reverb.buffer = impulse(context)
      active.connect(reverb)
      nodes.push(reverb)
      let wired = false
      updateParams = (params, _bpm, time) => {
        const wet = mix(params, time)
        if (!wired) {
          reverb.connect(wet)
          wired = true
        }
      }
      break
    }
    case 'chorus': {
      const mix = wetDry()
      const delay = context.createDelay(0.1)
      delay.delayTime.value = 0.02
      const lfo = context.createOscillator()
      const depth = context.createGain()
      lfo.type = 'sine'
      lfo.connect(depth).connect(delay.delayTime)
      lfo.start()
      active.connect(delay)
      nodes.push(delay, lfo, depth)
      let wired = false
      updateParams = (params, _bpm, time) => {
        const wet = mix(params, time)
        if (!wired) {
          delay.connect(wet)
          wired = true
        }
        smooth(lfo.frequency, params.rate, time)
        smooth(depth.gain, params.depth, time)
      }
      break
    }
    case 'saturation': {
      const mix = wetDry()
      const pre = context.createGain()
      const shaper = context.createWaveShaper()
      shaper.oversample = '2x'
      active.connect(pre).connect(shaper)
      nodes.push(pre, shaper)
      let wired = false
      updateParams = (params, _bpm, time) => {
        const wet = mix(params, time)
        if (!wired) {
          shaper.connect(wet)
          wired = true
        }
        shaper.curve = curve('saturation', params.drive)
        smooth(pre.gain, 1 + params.drive * 2, time)
      }
      break
    }
    case 'bitcrush': {
      const mix = wetDry()
      const shaper = context.createWaveShaper()
      shaper.curve = curve('bitcrush')
      active.connect(shaper)
      nodes.push(shaper)
      let wired = false
      updateParams = (params, _bpm, time) => {
        const wet = mix(params, time)
        if (!wired) {
          shaper.connect(wet)
          wired = true
        }
      }
      break
    }
  }

  const apply = (next: EffectInstance, tempo: number, time: number) => {
    current = next
    smooth(bypass.gain, next.enabled ? 0 : 1, time)
    smooth(active.gain, next.enabled ? 1 : 0, time)
    updateParams(next.params, tempo, time)
  }
  bypass.gain.value = effect.enabled ? 0 : 1
  active.gain.value = effect.enabled ? 1 : 0
  let lastBpm = bpm
  apply(current, bpm, context.currentTime)

  return {
    input,
    output,
    update: ([next], tempo, time = context.currentTime) => {
      lastBpm = tempo
      apply(structuredClone(next), tempo, time)
    },
    setParam: (effectId, param, value, time) => {
      if (effectId !== current.id) return
      const params = { ...current.params, [param]: value } as EffectParams
      current = { ...current, params }
      updateParams(params, lastBpm, time)
    },
    duck: (sourceTrackId, time, velocity) => {
      if (
        !duckNode ||
        current.type !== 'compressor' ||
        !current.enabled ||
        current.params.sidechainTrackId !== sourceTrackId
      )
        return
      const depth = Math.min(0.95, Math.max(0.1, (-current.params.threshold / 60) * velocity))
      const when = Math.max(time, context.currentTime)
      duckNode.gain.cancelScheduledValues(when)
      duckNode.gain.setValueAtTime(duckNode.gain.value, when)
      duckNode.gain.linearRampToValueAtTime(1 - depth, when + Math.max(0.001, current.params.attack))
      duckNode.gain.linearRampToValueAtTime(1, when + current.params.attack + Math.max(0.02, current.params.release))
    },
    dispose: () => nodes.forEach(node => node.disconnect()),
  }
}

export function effectChain(context: BaseAudioContext, effects: EffectInstance[], bpm: number): EffectChain {
  const input = context.createGain()
  let output: AudioNode = input
  const chains = effects.map(effect => createEffect(context, effect, bpm))
  for (const chain of chains) {
    output.connect(chain.input)
    output = chain.output
  }
  return {
    input,
    output,
    update: (current, tempo, time) =>
      chains.forEach((chain, index) => current[index] && chain.update([current[index]], tempo, time)),
    setParam: (effectId, param, value, time) => chains.forEach(chain => chain.setParam(effectId, param, value, time)),
    duck: (source, time, velocity) => chains.forEach(chain => chain.duck(source, time, velocity)),
    dispose: () => {
      input.disconnect()
      chains.forEach(chain => chain.dispose())
    },
  }
}

/** Identity for a chain layout; when it changes the chain must be rebuilt. */
export const chainSignature = (effects: EffectInstance[]) =>
  effects.map(effect => `${effect.id}:${effect.type}`).join('|')
