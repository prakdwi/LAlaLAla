import type { Pad, Project, Track } from '../state/types'
import { effectChain, type EffectChain } from './effects'
import { arrangement, LookaheadScheduler, STEPS, stepDuration, stepTime } from './timing'
import { encodeWav } from './wav'

type Voice = { source: AudioBufferSourceNode; gain: GainNode; trackId: string; group: number; start: number; end: number; stop: (time: number) => void }
type Bus = { gain: GainNode; pan: StereoPannerNode; effects: EffectChain; signature: string }
export type PlaybackEvent = { time: number; padId?: string; step?: number; patternId?: string; sectionId?: string }

export class AudioGraph {
  readonly context: BaseAudioContext
  readonly master: GainNode
  readonly analyser: AnalyserNode
  readonly buffers: Map<string, AudioBuffer>
  private buses = new Map<string, Bus>()
  private voices = new Set<Voice>()
  constructor(context: BaseAudioContext, buffers: Map<string, AudioBuffer>) {
    this.context = context; this.buffers = buffers
    this.master = context.createGain()
    const limiter = context.createDynamicsCompressor()
    limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20
    limiter.attack.value = 0.003; limiter.release.value = 0.1
    this.analyser = context.createAnalyser(); this.analyser.fftSize = 256
    this.master.connect(limiter).connect(this.analyser).connect(context.destination)
  }
  sync(project: Project) {
    const solo = project.tracks.some(track => track.solo)
    this.master.gain.setTargetAtTime(project.masterVolume, this.context.currentTime, 0.01)
    for (const track of project.tracks) {
      const signature = JSON.stringify(track.effects.map(effect => [effect.id, effect.type]))
      let bus = this.buses.get(track.id)
      if (!bus) {
        const gain = this.context.createGain()
        const pan = this.context.createStereoPanner()
        const effects = effectChain(this.context, track.effects, project.bpm)
        effects.output.connect(gain).connect(pan).connect(this.master)
        bus = { gain, pan, effects, signature }
        this.buses.set(track.id, bus)
      } else if (bus.signature !== signature) {
        this.stopTrack(track.id)
        bus.effects.dispose()
        bus.effects = effectChain(this.context, track.effects, project.bpm)
        bus.effects.output.connect(bus.gain)
        bus.signature = signature
      }
      bus.effects.update(track.effects, project.bpm)
      bus.gain.gain.setTargetAtTime(track.mute || (solo && !track.solo) ? 0 : track.volume, this.context.currentTime, 0.01)
      bus.pan.pan.setTargetAtTime(track.pan, this.context.currentTime, 0.01)
    }
  }
  trigger(track: Track, pad: Pad, time: number, velocity: number, bpm: number, gate?: number) {
    const buffer = this.buffers.get(track.sampleBufferId)
    const bus = this.buses.get(track.id)
    if (!buffer || !bus) return false
    const start = Math.max(0, Math.min(pad.startTime, buffer.duration - 0.001))
    const end = Math.max(start + 0.001, Math.min(pad.endTime, buffer.duration))
    const rate = 2 ** (pad.pitchSemitones / 12)
    const duration = pad.loop ? (gate ?? 60 / bpm * 4) : (end - start) / rate
    const when = Math.max(time, this.context.currentTime)
    if (pad.chokeGroup > 0) {
      for (const voice of this.voices) if (voice.group === pad.chokeGroup && voice.start <= when && voice.end > when) voice.stop(when)
    }
    const source = this.context.createBufferSource()
    source.buffer = buffer; source.playbackRate.value = rate
    source.loop = pad.loop; source.loopStart = start; source.loopEnd = end
    const gain = this.context.createGain()
    const pan = this.context.createStereoPanner()
    const effects = effectChain(this.context, pad.effects, bpm)
    source.connect(gain).connect(pan).connect(effects.input)
    effects.output.connect(bus.effects.input)
    pan.pan.value = pad.pan
    const attack = Math.min(pad.attack, duration / 2)
    const release = Math.min(Math.max(0.003, pad.release), duration / 2)
    gain.gain.setValueAtTime(0, when)
    gain.gain.linearRampToValueAtTime(pad.gain * velocity, when + Math.max(0.001, attack))
    gain.gain.setValueAtTime(pad.gain * velocity, when + duration - release)
    gain.gain.linearRampToValueAtTime(0, when + duration)
    const voice: Voice = {
      source, gain, trackId: track.id, group: pad.chokeGroup, start: when, end: when + duration,
      stop: stopTime => {
        if (stopTime >= voice.end) return
        voice.end = stopTime
        gain.gain.cancelAndHoldAtTime(stopTime)
        gain.gain.linearRampToValueAtTime(0, stopTime + 0.004)
        source.stop(stopTime + 0.005)
      },
    }
    source.start(when, start)
    this.voices.add(voice)
    if (pad.chokeGroup > 0) {
      const nextChoke = [...this.voices].filter(other => other !== voice && other.group === pad.chokeGroup && other.start > when)
        .reduce((earliest, other) => Math.min(earliest, other.start), Infinity)
      if (nextChoke < voice.end) voice.stop(nextChoke)
    }
    source.onended = () => {
      source.disconnect(); gain.disconnect(); pan.disconnect()
      if (this.context instanceof AudioContext) setTimeout(() => effects.dispose(), 8000)
      this.voices.delete(voice)
    }
    source.stop(Math.min(when + duration, voice.end + 0.005))
    return true
  }
  stopTrack(trackId: string) {
    for (const voice of this.voices) if (voice.trackId === trackId) voice.stop(this.context.currentTime)
  }
  stopAll() { for (const voice of this.voices) voice.stop(this.context.currentTime) }
}

export class StudioEngine {
  buffers = new Map<string, AudioBuffer>()
  blobs = new Map<string, Blob>()
  context?: AudioContext
  graph?: AudioGraph
  scheduler?: LookaheadScheduler
  events: PlaybackEvent[] = []
  playing = false
  origin = 0
  end = Infinity
  async ready() {
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: 'interactive' })
      this.graph = new AudioGraph(this.context, this.buffers)
    }
    if (this.context.state === 'suspended') await this.context.resume()
    return this.context
  }
  async decode(id: string, blob: Blob) {
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: 'interactive' })
      this.graph = new AudioGraph(this.context, this.buffers)
    }
    const buffer = await this.context.decodeAudioData(await blob.arrayBuffer())
    this.buffers.set(id, buffer); this.blobs.set(id, blob)
    return buffer
  }
  sync(project: Project) { this.graph?.sync(project) }
  async hit(project: Project, track: Track, pad: Pad, velocity = 1) {
    await this.ready()
    this.sync(project)
    const time = this.context!.currentTime + 0.005
    if (this.graph!.trigger(track, pad, time, velocity, project.bpm)) this.events.push({ time, padId: pad.id })
  }
  async play(getProject: () => Project, patternId: string, songMode: boolean) {
    await this.ready(); this.stop()
    const project = getProject()
    this.sync(project)
    const bars = songMode ? arrangement(project) : [{ patternId, sectionId: '' }]
    if (!bars.length) return
    this.playing = true
    this.scheduler = new LookaheadScheduler(() => this.context!.currentTime, ({ index, time }) => {
      const current = getProject()
      const bar = bars[Math.floor(index / STEPS) % bars.length]
      const pattern = current.patterns.find(item => item.id === bar.patternId)
      const stepIndex = index % STEPS
      this.events.push({ time, step: stepIndex, patternId: bar.patternId, sectionId: bar.sectionId })
      pattern?.trackSteps.forEach(row => {
        const step = row.steps[stepIndex]
        const track = current.tracks.find(item => item.id === row.trackId)
        const pad = track?.pads.find(item => item.id === (step.padId || track.sequencerPadId))
        if (!step?.active || !track || !pad) return
        const when = Math.max(this.context!.currentTime, time + Math.max(-50, Math.min(50, step.microTimingMs)) / 1000)
        if (this.graph!.trigger(track, pad, when, step.velocity, project.bpm, stepDuration(project.bpm))) {
          this.events.push({ time: when, padId: pad.id })
        }
      })
    })
    this.origin = this.scheduler.start(project.bpm, project.swing, songMode ? bars.length * STEPS : Infinity)
    this.end = songMode ? this.origin + bars.length * STEPS * stepDuration(project.bpm) : Infinity
  }
  stop() {
    this.scheduler?.stop(); this.graph?.stopAll(); this.events = []; this.playing = false
  }
  consumeEvents() {
    const now = this.context?.currentTime ?? 0
    const due = this.events.filter(event => event.time <= now)
    this.events = this.events.filter(event => event.time > now)
    if (this.playing && now >= this.end) { this.scheduler?.stop(); this.playing = false }
    return due.sort((first, second) => first.time - second.time)
  }
  async export(project: Project) {
    const bars = arrangement(project)
    if (!bars.length) throw new Error('Add a section to the song before exporting.')
    const length = bars.length * STEPS * stepDuration(project.bpm)
    if (length > 600) throw new Error('WAV export is limited to 10 minutes to protect browser memory.')
    const context = new OfflineAudioContext(2, Math.ceil((length + 8) * 44100), 44100)
    const graph = new AudioGraph(context, this.buffers)
    graph.sync(project)
    const notes: { track: Track; pad: Pad; time: number; velocity: number }[] = []
    bars.forEach((bar, barIndex) => {
      const pattern = project.patterns.find(item => item.id === bar.patternId)
      pattern?.trackSteps.forEach(row => {
        const track = project.tracks.find(item => item.id === row.trackId)
        if (!track) return
        row.steps.forEach((step, stepIndex) => {
          const pad = track.pads.find(item => item.id === (step.padId || track.sequencerPadId))
          if (step.active && pad) notes.push({ track, pad, velocity: step.velocity,
            time: Math.max(0, stepTime(barIndex * STEPS + stepIndex, project.bpm, project.swing) + step.microTimingMs / 1000) })
        })
      })
    })
    notes.sort((first, second) => first.time - second.time).forEach(note =>
      graph.trigger(note.track, note.pad, note.time, note.velocity, project.bpm, stepDuration(project.bpm)))
    return encodeWav(await context.startRendering())
  }
}

export const engine = new StudioEngine()