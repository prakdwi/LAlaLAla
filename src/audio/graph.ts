import type { AudioClip, AutomationTarget, Pad, Project, Track } from '../state/types'
import { automatedTargets, targetKey } from '../state/automation'
import { chainSignature, effectChain, type EffectChain } from './effects'
import { synthVoice } from './synth'

export type Voice = {
  kind: 'pad' | 'note' | 'clip'
  trackId: string
  group: number
  pitch?: number
  clipId?: string
  start: number
  end: number
  stop: (time: number) => void
  release: (time: number) => void
}

type Bus = {
  input: GainNode
  effects: EffectChain
  fader: GainNode
  auto: GainNode
  pan: StereoPannerNode
  analyser: AnalyserNode
  sends: Map<string, GainNode>
  signature: string
  outputTo: string
}

const MASTER = 'master'
const reversed = new WeakMap<AudioBuffer, AudioBuffer>()
function reverseBuffer(context: BaseAudioContext, buffer: AudioBuffer) {
  let result = reversed.get(buffer)
  if (!result) {
    result = context.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate)
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const source = buffer.getChannelData(channel)
      const target = result.getChannelData(channel)
      for (let index = 0, last = source.length - 1; index < source.length; index++) target[index] = source[last - index]
    }
    reversed.set(buffer, result)
  }
  return result
}

/**
 * The shared live/offline voice graph.
 * voice -> [pad chain] -> track input -> track effects -> fader -> automation gain -> pan -> analyser
 *       -> (master input | bus track input) ; sends tap post-pan.
 * master input -> master effects -> master gain -> analyser -> destination.
 */
export class AudioGraph {
  readonly context: BaseAudioContext
  readonly buffers: Map<string, AudioBuffer>
  readonly master: GainNode
  readonly masterIn: GainNode
  readonly analyser: AnalyserNode
  /** final stage; muted while sampling tab audio so pads stay out of the capture */
  readonly output: GainNode
  private masterChain: EffectChain
  private masterSignature = ''
  private click: GainNode
  private buses = new Map<string, Bus>()
  private padChains = new Map<string, { chain: EffectChain; signature: string; trackId: string }>()
  private voices = new Set<Voice>()
  private automated = new Set<string>()
  private scratch = new Float32Array(256)

  constructor(context: BaseAudioContext, buffers: Map<string, AudioBuffer>) {
    this.context = context
    this.buffers = buffers
    this.masterIn = context.createGain()
    this.master = context.createGain()
    this.analyser = context.createAnalyser()
    this.analyser.fftSize = 256
    this.masterChain = effectChain(context, [], 120)
    this.masterIn.connect(this.masterChain.input)
    this.masterChain.output.connect(this.master)
    this.output = context.createGain()
    this.master.connect(this.analyser).connect(this.output).connect(context.destination)
    this.click = context.createGain()
    this.click.gain.value = 0.5
    this.click.connect(this.master)
  }

  private destinationFor(project: Project, track: Track): { id: string; node: AudioNode } {
    const target = track.outputBusId ? project.tracks.find(item => item.id === track.outputBusId) : undefined
    const bus = target && target.kind === 'bus' && target.id !== track.id ? this.buses.get(target.id) : undefined
    return bus ? { id: target!.id, node: bus.input } : { id: MASTER, node: this.masterIn }
  }

  sync(project: Project) {
    const now = this.context.currentTime
    this.automated = automatedTargets(project)
    const masterSignature = chainSignature(project.masterEffects)
    if (masterSignature !== this.masterSignature) {
      this.masterIn.disconnect()
      this.masterChain.dispose()
      this.masterChain = effectChain(this.context, project.masterEffects, project.bpm)
      this.masterIn.connect(this.masterChain.input)
      this.masterChain.output.connect(this.master)
      this.masterSignature = masterSignature
    }
    this.masterChain.update(project.masterEffects, project.bpm)
    if (!this.automated.has('master:volume')) this.master.gain.setTargetAtTime(project.masterVolume, now, 0.01)

    for (const [id, bus] of this.buses) {
      if (!project.tracks.some(track => track.id === id)) {
        this.stopTrack(id)
        bus.effects.dispose()
        ;[bus.input, bus.fader, bus.auto, bus.pan, bus.analyser, ...bus.sends.values()].forEach(node =>
          node.disconnect(),
        )
        this.buses.delete(id)
      }
    }
    for (const [padId, entry] of this.padChains) {
      const track = project.tracks.find(item => item.id === entry.trackId)
      const pad = track?.pads.find(item => item.id === padId)
      if (!pad) {
        entry.chain.dispose()
        this.padChains.delete(padId)
      } else if (chainSignature(pad.effects) !== entry.signature) {
        entry.chain.dispose()
        this.padChains.delete(padId)
      } else entry.chain.update(pad.effects, project.bpm)
    }
    // Create buses first (bus tracks before their feeders) so routing targets exist.
    const ordered = [...project.tracks].sort((a, b) => Number(b.kind === 'bus') - Number(a.kind === 'bus'))
    for (const track of ordered) {
      let bus = this.buses.get(track.id)
      const signature = chainSignature(track.effects)
      if (!bus) {
        const input = this.context.createGain()
        const effects = effectChain(this.context, track.effects, project.bpm)
        const fader = this.context.createGain()
        const auto = this.context.createGain()
        const pan = this.context.createStereoPanner()
        const analyser = this.context.createAnalyser()
        analyser.fftSize = 256
        input.connect(effects.input)
        effects.output.connect(fader).connect(auto).connect(pan).connect(analyser)
        bus = { input, effects, fader, auto, pan, analyser, sends: new Map(), signature, outputTo: '' }
        this.buses.set(track.id, bus)
      } else if (bus.signature !== signature) {
        this.stopTrack(track.id)
        bus.input.disconnect()
        bus.effects.dispose()
        bus.effects = effectChain(this.context, track.effects, project.bpm)
        bus.input.connect(bus.effects.input)
        bus.effects.output.connect(bus.fader)
        bus.signature = signature
      }
      bus.effects.update(track.effects, project.bpm)
    }
    const solo = project.tracks.some(track => track.solo)
    for (const track of project.tracks) {
      const bus = this.buses.get(track.id)!
      const destination = this.destinationFor(project, track)
      if (bus.outputTo !== destination.id) {
        bus.analyser.disconnect()
        bus.analyser.connect(destination.node)
        bus.outputTo = destination.id
      }
      const silent = track.mute || (solo && !track.solo)
      const volumeAutomated = this.automated.has(`track:${track.id}:volume`)
      bus.fader.gain.setTargetAtTime(silent ? 0 : volumeAutomated ? 1 : track.volume, now, 0.01)
      if (!volumeAutomated) bus.auto.gain.setTargetAtTime(1, now, 0.01)
      if (!this.automated.has(`track:${track.id}:pan`)) bus.pan.pan.setTargetAtTime(track.pan, now, 0.01)
      for (const [busId, gain] of bus.sends) {
        if (!track.sends.some(send => send.busId === busId)) {
          gain.disconnect()
          bus.sends.delete(busId)
        }
      }
      for (const send of track.sends) {
        const target = project.tracks.find(item => item.id === send.busId)
        const targetBus = target?.kind === 'bus' && target.id !== track.id ? this.buses.get(target.id) : undefined
        if (!targetBus) continue
        let gain = bus.sends.get(send.busId)
        if (!gain) {
          gain = this.context.createGain()
          gain.gain.value = 0
          bus.pan.connect(gain).connect(targetBus.input)
          bus.sends.set(send.busId, gain)
        }
        gain.gain.setTargetAtTime(send.level, now, 0.01)
      }
    }
  }

  private padChain(track: Track, pad: Pad, bpm: number) {
    const bus = this.buses.get(track.id)!
    if (!pad.effects.length) return bus.input
    let entry = this.padChains.get(pad.id)
    if (!entry) {
      const chain = effectChain(this.context, pad.effects, bpm)
      chain.output.connect(bus.input)
      entry = { chain, signature: chainSignature(pad.effects), trackId: track.id }
      this.padChains.set(pad.id, entry)
    }
    return entry.chain.input
  }

  private sidechain(trackId: string, time: number, velocity: number) {
    for (const bus of this.buses.values()) bus.effects.duck(trackId, time, velocity)
    this.masterChain.duck(trackId, time, velocity)
  }

  private chokeBefore(group: number, when: number) {
    if (group <= 0) return
    for (const voice of this.voices)
      if (voice.group === group && voice.start <= when && voice.end > when) voice.stop(when)
  }

  private chokeAfter(voice: Voice, when: number) {
    if (voice.group <= 0) return
    const next = [...this.voices]
      .filter(other => other !== voice && other.group === voice.group && other.start > when)
      .reduce((earliest, other) => Math.min(earliest, other.start), Infinity)
    if (next < voice.end) voice.stop(next)
  }

  private sampleVoice(
    track: Track,
    pad: Pad,
    time: number,
    velocity: number,
    rate: number,
    duration: number,
    hold: boolean,
    bpm: number,
    kind: Voice['kind'],
    pitch?: number,
  ): Voice | undefined {
    const original = this.buffers.get(track.sampleBufferId)
    const bus = this.buses.get(track.id)
    if (!original || !bus) return
    const buffer = pad.reverse ? reverseBuffer(this.context, original) : original
    const forwardStart = Math.max(0, Math.min(pad.startTime, buffer.duration - 0.001))
    const forwardEnd = Math.max(forwardStart + 0.001, Math.min(pad.endTime, buffer.duration))
    const start = pad.reverse ? buffer.duration - forwardEnd : forwardStart
    const end = pad.reverse ? buffer.duration - forwardStart : forwardEnd
    const when = Math.max(time, this.context.currentTime)
    this.chokeBefore(pad.chokeGroup, when)
    const source = this.context.createBufferSource()
    source.buffer = buffer
    source.playbackRate.value = rate
    source.loop = pad.loop
    source.loopStart = start
    source.loopEnd = end
    const gain = this.context.createGain()
    const pan = this.context.createStereoPanner()
    pan.pan.value = pad.pan
    source
      .connect(gain)
      .connect(pan)
      .connect(this.padChain(track, pad, bpm))
    const natural = pad.loop ? Infinity : (end - start) / rate
    const length = hold ? Math.min(natural, Infinity) : Math.min(duration, natural)
    const peak = pad.gain * velocity
    const attack = Math.max(0.001, Math.min(pad.attack, Number.isFinite(length) ? length / 2 : pad.attack))
    const releaseTime = Math.min(Math.max(0.003, pad.release), Number.isFinite(length) ? length / 2 : pad.release)
    gain.gain.setValueAtTime(0, when)
    gain.gain.linearRampToValueAtTime(peak, when + attack)
    if (Number.isFinite(length)) {
      gain.gain.setValueAtTime(peak, when + length - releaseTime)
      gain.gain.linearRampToValueAtTime(0, when + length)
    }
    let finished = false
    const voice: Voice = {
      kind,
      trackId: track.id,
      group: pad.chokeGroup,
      pitch,
      start: when,
      end: Number.isFinite(length) ? when + length : Infinity,
      stop: stopTime => {
        if (finished || stopTime >= voice.end) return
        voice.end = stopTime
        gain.gain.cancelAndHoldAtTime(stopTime)
        gain.gain.linearRampToValueAtTime(0, stopTime + 0.004)
        source.stop(stopTime + 0.005)
      },
      release: releaseAt => {
        if (finished || releaseAt >= voice.end) return
        const tail = Math.max(0.01, pad.release)
        voice.end = releaseAt + tail
        gain.gain.cancelAndHoldAtTime(releaseAt)
        gain.gain.linearRampToValueAtTime(0, releaseAt + tail)
        source.stop(releaseAt + tail + 0.005)
      },
    }
    source.start(when, start)
    this.voices.add(voice)
    this.chokeAfter(voice, when)
    source.onended = () => {
      finished = true
      source.disconnect()
      gain.disconnect()
      pan.disconnect()
      this.voices.delete(voice)
    }
    if (Number.isFinite(length)) source.stop(Math.min(when + length, voice.end + 0.005))
    this.sidechain(track.id, when, velocity)
    return voice
  }

  /** Drum pad hit. `gate` bounds looped pads (one step when sequenced, one bar when played live). */
  trigger(track: Track, pad: Pad, time: number, velocity: number, bpm: number, gate?: number) {
    const rate = 2 ** (pad.pitchSemitones / 12)
    const duration = pad.loop ? (gate ?? (60 / bpm) * 4) : Infinity
    return Boolean(this.sampleVoice(track, pad, time, velocity, rate, duration, false, bpm, 'pad'))
  }

  /** Pitched note for keys and synth tracks. `duration` Infinity holds until releaseNote. */
  triggerNote(
    track: Track,
    pitch: number,
    time: number,
    velocity: number,
    duration: number,
    bpm = 120,
  ): Voice | undefined {
    const bus = this.buses.get(track.id)
    if (!bus) return
    const when = Math.max(time, this.context.currentTime)
    if (track.kind === 'synth' && track.synth) {
      const synth = synthVoice(this.context, track.synth, pitch, when, velocity, duration)
      synth.output.connect(bus.input)
      const voice: Voice = {
        kind: 'note',
        trackId: track.id,
        group: 0,
        pitch,
        start: when,
        end: Number.isFinite(duration) ? when + duration + track.synth.release * 1.5 : Infinity,
        stop: synth.stop,
        release: releaseAt => {
          voice.end = releaseAt + track.synth!.release * 1.5
          synth.release(releaseAt)
        },
      }
      synth.onended = () => this.voices.delete(voice)
      this.voices.add(voice)
      this.sidechain(track.id, when, velocity)
      return voice
    }
    if (track.kind === 'keys' || track.kind === 'drums') {
      const pad = track.pads[0]
      if (!pad) return
      const rate = 2 ** ((pitch - track.rootNote + pad.pitchSemitones) / 12)
      return this.sampleVoice(
        track,
        pad,
        when,
        velocity,
        rate,
        duration,
        !Number.isFinite(duration),
        bpm,
        'note',
        pitch,
      )
    }
  }

  releaseNote(trackId: string, pitch: number, time: number) {
    for (const voice of this.voices) {
      if (voice.kind === 'note' && voice.trackId === trackId && voice.pitch === pitch && voice.end === Infinity)
        voice.release(time)
    }
  }

  /** Audio clip region: `offset` seconds into the buffer, `duration` seconds of playback. */
  playClip(track: Track, clip: AudioClip, time: number, offset: number, duration: number): Voice | undefined {
    const buffer = this.buffers.get(clip.bufferId)
    const bus = this.buses.get(track.id)
    if (!buffer || !bus || duration <= 0 || offset >= buffer.duration) return
    const when = Math.max(time, this.context.currentTime)
    const rate = 2 ** (clip.pitchSemitones / 12)
    const available = (buffer.duration - offset) / rate
    const length = Math.min(duration, available)
    const source = this.context.createBufferSource()
    source.buffer = buffer
    source.playbackRate.value = rate
    const gain = this.context.createGain()
    source.connect(gain).connect(bus.input)
    const fadeIn = Math.min(clip.fadeIn, length / 2)
    const fadeOut = Math.min(clip.fadeOut, length / 2)
    gain.gain.setValueAtTime(fadeIn > 0 ? 0 : clip.gain, when)
    if (fadeIn > 0) gain.gain.linearRampToValueAtTime(clip.gain, when + fadeIn)
    gain.gain.setValueAtTime(clip.gain, when + length - fadeOut)
    gain.gain.linearRampToValueAtTime(0, when + length)
    let finished = false
    const voice: Voice = {
      kind: 'clip',
      trackId: track.id,
      group: 0,
      clipId: clip.id,
      start: when,
      end: when + length,
      stop: stopTime => {
        if (finished || stopTime >= voice.end) return
        voice.end = stopTime
        gain.gain.cancelAndHoldAtTime(stopTime)
        gain.gain.linearRampToValueAtTime(0, stopTime + 0.004)
        source.stop(stopTime + 0.005)
      },
      release: stopTime => voice.stop(stopTime),
    }
    source.start(when, offset, length * rate + 0.01)
    source.onended = () => {
      finished = true
      source.disconnect()
      gain.disconnect()
      this.voices.delete(voice)
    }
    this.voices.add(voice)
    return voice
  }

  /** Metronome click, post master effects. */
  metronome(time: number, accent: boolean) {
    const osc = this.context.createOscillator()
    const gain = this.context.createGain()
    osc.type = 'square'
    osc.frequency.value = accent ? 1400 : 900
    gain.gain.setValueAtTime(0.0001, time)
    gain.gain.exponentialRampToValueAtTime(accent ? 0.6 : 0.35, time + 0.002)
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.04)
    osc.connect(gain).connect(this.click)
    osc.start(time)
    osc.stop(time + 0.05)
    osc.onended = () => {
      osc.disconnect()
      gain.disconnect()
    }
  }

  /** Apply one automation value at `time`. Values are in the parameter's natural units. */
  automate(target: AutomationTarget, value: number, time: number) {
    const when = Math.max(time, this.context.currentTime)
    if (target.kind === 'master') {
      this.master.gain.setTargetAtTime(value, when, 0.01)
      return
    }
    const bus = this.buses.get(target.trackId)
    if (!bus) return
    if (target.kind === 'track') {
      if (target.param === 'volume') bus.auto.gain.setTargetAtTime(value, when, 0.01)
      else bus.pan.pan.setTargetAtTime(value, when, 0.01)
      return
    }
    bus.effects.setParam(target.effectId, target.param, value, when)
  }

  /** Input node of a track, for live monitoring and recorder routing. */
  inputFor(trackId: string): AudioNode {
    return this.buses.get(trackId)?.input ?? this.masterIn
  }

  isAutomated(target: AutomationTarget) {
    return this.automated.has(targetKey(target))
  }

  setOutputMuted(muted: boolean) {
    this.output.gain.setTargetAtTime(muted ? 0 : 1, this.context.currentTime, 0.01)
  }

  /** RMS level per track and master, for meters. */
  levels() {
    const result = new Map<string, number>()
    const rms = (analyser: AnalyserNode) => {
      analyser.getFloatTimeDomainData(this.scratch)
      let sum = 0
      for (let index = 0; index < this.scratch.length; index++) sum += this.scratch[index] ** 2
      return Math.sqrt(sum / this.scratch.length)
    }
    for (const [id, bus] of this.buses) result.set(id, rms(bus.analyser))
    result.set(MASTER, rms(this.analyser))
    return result
  }

  stopTrack(trackId: string) {
    for (const voice of this.voices) if (voice.trackId === trackId) voice.stop(this.context.currentTime)
  }
  stopClips(time = this.context.currentTime) {
    for (const voice of this.voices) if (voice.kind === 'clip') voice.stop(time)
  }
  stopAll() {
    for (const voice of this.voices) voice.stop(this.context.currentTime)
  }
  get voiceCount() {
    return this.voices.size
  }
}
