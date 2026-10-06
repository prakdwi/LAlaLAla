import type { SynthParams } from '../state/types'

export const midiToHz = (pitch: number) => 440 * 2 ** ((pitch - 69) / 12)

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>()
function noise(context: BaseAudioContext) {
  let buffer = noiseBuffers.get(context)
  if (!buffer) {
    buffer = context.createBuffer(1, context.sampleRate, context.sampleRate)
    const data = buffer.getChannelData(0)
    let seed = 7
    for (let index = 0; index < data.length; index++) {
      seed = (seed * 16807) % 2147483647
      data[index] = (seed / 2147483647) * 2 - 1
    }
    noiseBuffers.set(context, buffer)
  }
  return buffer
}

export type SynthVoice = {
  output: GainNode
  /** Enter the release stage at `time`; the voice silences itself afterwards. */
  release: (time: number) => void
  /** Hard stop with a short fade. */
  stop: (time: number) => void
  glideTo: (pitch: number, time: number) => void
  onended?: () => void
}

/**
 * Two-oscillator subtractive voice: osc1 + detuned osc2 + sub + noise -> resonant low-pass with
 * envelope -> ADSR amp. `duration` of Infinity holds the note until `release` is called.
 */
export function synthVoice(
  context: BaseAudioContext,
  params: SynthParams,
  pitch: number,
  when: number,
  velocity: number,
  duration: number,
): SynthVoice {
  const hz = midiToHz(pitch)
  const output = context.createGain()
  const amp = context.createGain()
  const filter = context.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.value = params.resonance
  amp.connect(filter).connect(output)
  const sources: (OscillatorNode | AudioBufferSourceNode)[] = []
  const oscillators: OscillatorNode[] = []
  const unison = Math.max(1, Math.min(7, Math.round(params.unison)))
  const addOsc = (type: OscillatorType, detuneSemitones: number, level: number, octave = 0) => {
    if (level <= 0) return
    for (let voiceIndex = 0; voiceIndex < unison; voiceIndex++) {
      const osc = context.createOscillator()
      const gain = context.createGain()
      const spread = unison > 1 ? ((voiceIndex / (unison - 1)) * 2 - 1) * params.spread * 50 : 0
      osc.type = type
      osc.frequency.value = hz * 2 ** octave
      osc.detune.value = detuneSemitones * 100 + spread
      gain.gain.value = level / Math.sqrt(unison)
      osc.connect(gain).connect(amp)
      sources.push(osc)
      oscillators.push(osc)
    }
  }
  addOsc(params.osc1, 0, 1)
  addOsc(params.osc2, params.osc2Detune, params.osc2Level)
  if (params.subLevel > 0) {
    const sub = context.createOscillator()
    const gain = context.createGain()
    sub.type = 'sine'
    sub.frequency.value = hz / 2
    gain.gain.value = params.subLevel
    sub.connect(gain).connect(amp)
    sources.push(sub)
    oscillators.push(sub)
  }
  if (params.noiseLevel > 0) {
    const source = context.createBufferSource()
    const gain = context.createGain()
    source.buffer = noise(context)
    source.loop = true
    gain.gain.value = params.noiseLevel * 0.5
    source.connect(gain).connect(amp)
    sources.push(source)
  }
  const peak = Math.max(0.0001, velocity) * 0.5
  const attack = Math.max(0.001, params.attack)
  const decay = Math.max(0.001, params.decay)
  amp.gain.setValueAtTime(0, when)
  amp.gain.linearRampToValueAtTime(peak, when + attack)
  amp.gain.setTargetAtTime(peak * params.sustain, when + attack, decay / 3)
  const baseCutoff = Math.min(20000, Math.max(30, params.cutoff))
  const envCutoff = Math.min(20000, baseCutoff + params.envAmount * velocity * 12000)
  filter.frequency.setValueAtTime(envCutoff, when)
  filter.frequency.setTargetAtTime(baseCutoff, when + attack, decay / 2)
  for (const source of sources) source.start(when)
  let released = false
  let ended = false
  const voice: SynthVoice = {
    output,
    release: time => {
      if (released) return
      released = true
      const release = Math.max(0.005, params.release)
      amp.gain.cancelAndHoldAtTime(time)
      amp.gain.setTargetAtTime(0, time, release / 4)
      const stopAt = time + release * 1.5
      for (const source of sources) source.stop(stopAt)
    },
    stop: time => {
      if (ended) return
      released = true
      amp.gain.cancelAndHoldAtTime(time)
      amp.gain.linearRampToValueAtTime(0, time + 0.005)
      for (const source of sources) source.stop(time + 0.006)
    },
    glideTo: (next, time) => {
      const target = midiToHz(next)
      const glide = Math.max(0.001, params.glide)
      for (const osc of oscillators) {
        const ratio = osc.frequency.value / hz
        osc.frequency.setTargetAtTime(target * ratio, time, glide / 3)
      }
    },
  }
  sources[0].onended = () => {
    ended = true
    sources.forEach(source => source.disconnect())
    amp.disconnect()
    filter.disconnect()
    output.disconnect()
    voice.onended?.()
  }
  if (Number.isFinite(duration)) voice.release(when + duration)
  return voice
}
