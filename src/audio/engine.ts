import type { MidiClip, Pad, Project, Track } from '../state/types'
import { patternStepsAt } from '../state/arrangement'
import { automationAt } from '../state/automation'
import { stepsPerBar } from '../state/defaults'
import { AudioGraph, type Voice } from './graph'
export { AudioGraph } from './graph'
import { Ticker } from './clock'
import { InputRecorder } from './recorder'
import { arrangementSteps, LookaheadScheduler, stepDuration, stepTime } from './timing'
import { encodeWav } from './wav'

export type PlaybackEvent = {
  time: number
  padId?: string
  trackId?: string
  pitch?: number
  /** global sixteenth step (negative during count-in) */
  step?: number
  /** pattern being played at this step with its local step, one event per active pattern clip */
  patternId?: string
  localStep?: number
  clipId?: string
}

export type PlayOptions = { fromBeat?: number; countInBars?: number }

type StepContext = {
  project: Project
  graph: AudioGraph
  mode: 'pattern' | 'song'
  patternId: string
  /** audio time of beat 0, ignoring swing */
  origin: number
  events?: PlaybackEvent[]
}

const beatSeconds = (bpm: number) => 60 / bpm

/**
 * Schedules everything that happens on one global sixteenth step. Shared by live playback and the
 * offline renderers so they cannot drift apart.
 */
export function scheduleStep(ctx: StepContext, index: number, time: number) {
  const { project, graph, events } = ctx
  const perBar = stepsPerBar(project)
  const bpm = project.bpm
  const gate = stepDuration(bpm)
  if (project.metronome && ctx.mode === 'song' && index % 4 === 0)
    graph.metronome(time, ((index % perBar) + perBar) % perBar === 0)
  if (index < 0) {
    if (project.metronome && ctx.mode === 'pattern' && index % 4 === 0)
      graph.metronome(time, ((index % perBar) + perBar) % perBar === 0)
    events?.push({ time, step: index })
    return
  }
  events?.push({ time, step: index })

  const fire = (track: Track, step: Project['patterns'][0]['trackSteps'][0]['steps'][0], when: number) => {
    if (track.kind === 'synth' || track.kind === 'keys') {
      if (graph.triggerNote(track, track.rootNote, when, step.velocity, gate, bpm)) {
        events?.push({ time: when, trackId: track.id, pitch: track.rootNote })
      }
      return
    }
    const pad = track.pads.find(item => item.id === (step.padId || track.sequencerPadId))
    if (pad && !pad.mute && graph.trigger(track, pad, when, step.velocity, bpm, gate))
      events?.push({ time: when, padId: pad.id })
  }
  const playPattern = (patternId: string, localStep: number) => {
    const pattern = project.patterns.find(item => item.id === patternId)
    if (!pattern) return
    events?.push({ time, patternId, localStep })
    const patternBeats = (pattern.bars * perBar) / 4
    for (const row of pattern.trackSteps) {
      const track = project.tracks.find(item => item.id === row.trackId)
      if (!track || track.kind === 'audio' || track.kind === 'bus') continue
      const step = row.steps[localStep]
      if (step?.active) {
        const when = Math.max(
          graph.context.currentTime,
          time + Math.max(-50, Math.min(gate * 1000, step.microTimingMs)) / 1000,
        )
        fire(track, step, when)
      }
      if (row.notes?.length && (track.kind === 'keys' || track.kind === 'synth')) {
        const localBeat = localStep / 4
        for (const note of row.notes) {
          if (note.start < localBeat || note.start >= localBeat + 0.25) continue
          const when = time + (note.start - localBeat) * beatSeconds(bpm)
          const duration = Math.max(0.02, Math.min(note.length, patternBeats - note.start) * beatSeconds(bpm))
          if (graph.triggerNote(track, note.pitch, when, note.velocity, duration, bpm)) {
            events?.push({ time: when, trackId: track.id, pitch: note.pitch })
          }
        }
      }
    }
  }

  if (ctx.mode === 'pattern') {
    const pattern = project.patterns.find(item => item.id === ctx.patternId)
    if (!pattern) return
    const total = pattern.bars * perBar
    playPattern(pattern.id, ((index % total) + total) % total)
    if (project.metronome && index % 4 === 0) graph.metronome(time, index % perBar === 0)
    return
  }

  for (const hit of patternStepsAt(project, index)) playPattern(hit.patternId, hit.localStep)

  const beat = index / 4
  const windowEnd = beat + 0.25
  for (const clip of project.clips) {
    if (clip.muted) continue
    const track = project.tracks.find(
      item => item.id === (clip.kind === 'midi' || clip.kind === 'audio' ? clip.trackId : ''),
    )
    if (clip.kind === 'midi' && track) scheduleMidi(ctx, clip, track, beat, windowEnd, time)
    else if (clip.kind === 'audio' && track && Math.round(clip.start * 4) === index) {
      const duration = clip.length * beatSeconds(bpm)
      if (graph.playClip(track, clip, time, clip.offset, duration)) events?.push({ time, clipId: clip.id })
    }
  }
  for (const { target, value } of automationAt(project, beat).values()) graph.automate(target, value, time)
}

function scheduleMidi(ctx: StepContext, clip: MidiClip, track: Track, beat: number, windowEnd: number, time: number) {
  if (beat >= clip.start + clip.length || windowEnd <= clip.start) return
  const bpm = ctx.project.bpm
  const loop = Math.max(0.25, clip.loopLength || clip.length)
  const localStart = Math.max(0, beat - clip.start)
  const localEnd = Math.min(clip.length, windowEnd - clip.start)
  const ranges: [number, number, number][] = []
  const wrappedStart = localStart % loop
  const wrappedEnd = wrappedStart + (localEnd - localStart)
  if (wrappedEnd <= loop) ranges.push([wrappedStart, wrappedEnd, 0])
  else {
    ranges.push([wrappedStart, loop, 0])
    ranges.push([0, wrappedEnd - loop, loop - wrappedStart])
  }
  for (const note of clip.notes) {
    for (const [from, to, shift] of ranges) {
      if (note.start < from || note.start >= to) continue
      const when = time + (note.start - from + shift) * beatSeconds(bpm)
      const remaining = clip.start + clip.length - (beat + (note.start - from + shift))
      const duration = Math.max(0.02, Math.min(note.length, remaining) * beatSeconds(bpm))
      if (ctx.graph.triggerNote(track, note.pitch, when, note.velocity, duration, bpm)) {
        ctx.events?.push({ time: when, trackId: track.id, pitch: note.pitch, clipId: clip.id })
      }
    }
  }
}

/** Start audio clips that are already in progress at `beat` (play-from-middle, loop wrap). */
function resumeAudioClips(ctx: StepContext, beat: number, time: number) {
  const bpm = ctx.project.bpm
  for (const clip of ctx.project.clips) {
    if (clip.kind !== 'audio' || clip.muted || beat <= clip.start || beat >= clip.start + clip.length) continue
    const track = ctx.project.tracks.find(item => item.id === clip.trackId)
    if (!track) continue
    const skipped = (beat - clip.start) * beatSeconds(bpm)
    ctx.graph.playClip(track, clip, time, clip.offset + skipped, clip.length * beatSeconds(bpm) - skipped)
  }
}

export class StudioEngine {
  buffers = new Map<string, AudioBuffer>()
  blobs = new Map<string, Blob>()
  context?: AudioContext
  graph?: AudioGraph
  scheduler?: LookaheadScheduler
  ticker?: Ticker
  recorder?: InputRecorder
  events: PlaybackEvent[] = []
  playing = false
  mode: 'pattern' | 'song' = 'pattern'
  /** audio time of step 0 for the current run (after count-in) */
  origin = 0
  /** true while a count-in is running: hits before step 0 are not recorded */
  get countingIn() {
    return this.playing && this.countIn > 0 && this.positionBeats() < 0
  }
  private countIn = 0
  end = Infinity
  private getProject: () => Project = () => {
    throw new Error('engine not started')
  }
  private patternId = ''
  private held = new Map<string, Voice>()

  private ensureContext() {
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: 'interactive' })
      this.graph = new AudioGraph(this.context, this.buffers)
      this.recorder = new InputRecorder(this.context)
    }
    return this.context
  }
  async ready() {
    const context = this.ensureContext()
    if (context.state === 'suspended') await context.resume()
    if (!this.ticker) this.ticker = await Ticker.create(context)
    return context
  }
  async decode(id: string, blob: Blob) {
    const context = this.ensureContext()
    const buffer = await context.decodeAudioData(await blob.arrayBuffer())
    this.buffers.set(id, buffer)
    this.blobs.set(id, blob)
    return buffer
  }
  /** Register an already-decoded buffer (recordings) with its encoded blob. */
  register(id: string, buffer: AudioBuffer, blob: Blob) {
    this.buffers.set(id, buffer)
    this.blobs.set(id, blob)
  }
  sync(project: Project) {
    this.graph?.sync(project)
  }
  get clockKind() {
    return this.ticker?.kind ?? 'interval'
  }

  async hit(project: Project, track: Track, pad: Pad, velocity = 1) {
    await this.ready()
    this.sync(project)
    const time = this.context!.currentTime + 0.005
    if (this.graph!.trigger(track, pad, time, velocity, project.bpm)) this.events.push({ time, padId: pad.id })
    return time
  }
  async noteOn(project: Project, track: Track, pitch: number, velocity = 1) {
    await this.ready()
    this.sync(project)
    const key = `${track.id}:${pitch}`
    const time = this.context!.currentTime + 0.005
    this.held.get(key)?.release(time)
    const voice = this.graph!.triggerNote(track, pitch, time, velocity, Infinity, project.bpm)
    if (voice) {
      this.held.set(key, voice)
      this.events.push({ time, trackId: track.id, pitch })
    }
    return time
  }
  noteOff(track: Track, pitch: number) {
    const key = `${track.id}:${pitch}`
    const time = (this.context?.currentTime ?? 0) + 0.002
    const voice = this.held.get(key)
    if (voice) {
      voice.release(time)
      this.held.delete(key)
    } else this.graph?.releaseNote(track.id, pitch, time)
    return time
  }
  releaseAll() {
    const time = this.context?.currentTime ?? 0
    for (const voice of this.held.values()) voice.release(time)
    this.held.clear()
  }

  private stepContext(project: Project): StepContext {
    return {
      project,
      graph: this.graph!,
      mode: this.mode,
      patternId: this.patternId,
      origin: this.origin,
      events: this.events,
    }
  }

  async play(getProject: () => Project, patternId: string, songMode: boolean, options: PlayOptions = {}) {
    await this.ready()
    this.stop()
    const project = getProject()
    this.sync(project)
    this.getProject = getProject
    this.patternId = patternId
    this.mode = songMode ? 'song' : 'pattern'
    const perBar = stepsPerBar(project)
    const pattern = project.patterns.find(item => item.id === patternId)
    if (!songMode && !pattern) return
    const total = songMode ? arrangementSteps(project) : Infinity
    if (songMode && total <= 0) return
    const fromStep = Math.max(0, Math.round((options.fromBeat ?? 0) * 4))
    const countIn = Math.max(0, Math.round(options.countInBars ?? 0)) * perBar
    this.countIn = countIn
    const loop =
      songMode && project.loop.enabled
        ? { start: Math.round(project.loop.start * 4), end: Math.round(project.loop.end * 4) }
        : !songMode && pattern
          ? { start: 0, end: pattern.bars * perBar }
          : null
    this.playing = true
    this.scheduler = new LookaheadScheduler(
      () => this.context!.currentTime,
      ({ index, time }) => scheduleStep(this.stepContext(this.getProject()), index, time),
    )
    this.scheduler.onWrap = (step, time) => {
      this.graph!.stopClips(time)
      if (this.mode === 'song') resumeAudioClips(this.stepContext(this.getProject()), step / 4, time)
    }
    const startStep = loop && fromStep >= loop.end ? loop.start : fromStep
    const origin = this.scheduler.start(project.bpm, project.swing, total, false, startStep - countIn, loop)
    this.origin = origin
    this.end = songMode && !loop ? origin + stepTime(total, project.bpm, project.swing) : Infinity
    if (songMode)
      resumeAudioClips(
        this.stepContext(project),
        startStep / 4,
        origin + stepTime(startStep, project.bpm, project.swing),
      )
    this.ticker!.start(() => this.scheduler?.tick())
    return origin
  }
  stop() {
    this.ticker?.stop()
    this.scheduler?.stop()
    this.graph?.stopAll()
    this.releaseAll()
    this.events = []
    this.playing = false
  }
  /** Jump playback to a beat without stopping. */
  seek(beat: number) {
    if (!this.scheduler || !this.playing) return
    const step = Math.max(0, Math.round(beat * 4))
    this.graph?.stopAll()
    this.scheduler.seek(step)
    const time = this.scheduler.timeOf(step)
    if (this.mode === 'song') resumeAudioClips(this.stepContext(this.getProject()), step / 4, time)
  }
  setTempo(bpm: number, swing: number) {
    this.scheduler?.setTempo(bpm, swing)
  }
  setLoop(project: Project) {
    if (!this.scheduler) return
    if (this.mode === 'song')
      this.scheduler.setLoop(
        project.loop.enabled
          ? { start: Math.round(project.loop.start * 4), end: Math.round(project.loop.end * 4) }
          : null,
      )
    else {
      const pattern = project.patterns.find(item => item.id === this.patternId)
      if (pattern) this.scheduler.setLoop({ start: 0, end: pattern.bars * stepsPerBar(project) })
    }
  }
  /** Current musical position in beats (fractional). Negative during count-in. */
  positionBeats() {
    if (!this.scheduler || !this.playing || !this.context) return -1
    return this.scheduler.position(this.context.currentTime) / 4
  }
  /** Time when a beat will sound, from the live scheduler. */
  timeOfBeat(beat: number) {
    return this.scheduler?.timeOf(Math.round(beat * 4)) ?? this.context?.currentTime ?? 0
  }
  consumeEvents() {
    const now = this.context?.currentTime ?? 0
    const due = this.events.filter(event => event.time <= now)
    this.events = this.events.filter(event => event.time > now)
    if (this.playing && now >= this.end) {
      this.scheduler?.stop()
      this.ticker?.stop()
      this.playing = false
    }
    return due.sort((first, second) => first.time - second.time)
  }
  levels() {
    return this.graph?.levels() ?? new Map<string, number>()
  }

  /** Renders the arrangement (or one track of it) to a stereo 16-bit WAV. */
  async render(project: Project, options: { soloTrackId?: string; tail?: number } = {}) {
    const total = arrangementSteps(project)
    if (!project.clips.length) throw new Error('Add a clip to the arrangement before exporting.')
    const length = total * stepDuration(project.bpm)
    if (length > 600) throw new Error('WAV export is limited to 10 minutes to protect browser memory.')
    const tail = options.tail ?? 8
    const context = new OfflineAudioContext(2, Math.ceil((length + tail) * 44100), 44100)
    const graph = new AudioGraph(context, this.buffers)
    const rendered: Project = options.soloTrackId
      ? {
          ...project,
          metronome: false,
          tracks: project.tracks.map(track => ({
            ...track,
            solo:
              track.id === options.soloTrackId ||
              (track.kind === 'bus' && track.id !== options.soloTrackId ? false : track.solo && false),
            mute: track.kind !== 'bus' && track.id !== options.soloTrackId ? true : track.mute,
          })),
        }
      : { ...project, metronome: false }
    graph.sync(rendered)
    const ctx: StepContext = { project: rendered, graph, mode: 'song', patternId: '', origin: 0 }
    for (let index = 0; index < total; index++) scheduleStep(ctx, index, stepTime(index, project.bpm, project.swing))
    return encodeWav(await context.startRendering())
  }
  async export(project: Project) {
    return this.render(project)
  }
  /** One WAV per playable track, with buses and master effects applied. */
  async renderStems(project: Project, onProgress?: (done: number, total: number) => void) {
    const tracks = project.tracks.filter(track => track.kind !== 'bus')
    const stems: { name: string; blob: Blob }[] = []
    for (const [index, track] of tracks.entries()) {
      stems.push({ name: track.name, blob: await this.render(project, { soloTrackId: track.id, tail: 4 }) })
      onProgress?.(index + 1, tracks.length)
    }
    return stems
  }
}

export const engine = new StudioEngine()
