/**
 * MPC-style performance helpers: velocity from pad position, 16 levels, note repeat, tap tempo,
 * erase, sampling into pads and resampling patterns. UI state lives in the store under `mpc`.
 */
import { engine, scheduleStep } from '../audio/engine'
import { AudioGraph } from '../audio/graph'
import { stepDuration } from '../audio/timing'
import { detectSlices, equalSlices } from '../audio/slicing'
import { encodeWav } from '../audio/wav'
import { notify, reportError, useStudio } from './store'
import { makeStep, makeTrack, stepsPerBar, uid } from './defaults'
import { recordHit, selectTrack, setTempo, triggerPad } from './actions'
import { assignSample, padsInBank } from './sampling'
import type { Pad, Track } from './types'

export type LevelsMode = 'off' | 'velocity' | 'tune'
/** recording grid in beats; 0 keeps the played timing as microtiming */
export type QuantizeGrid = 0 | 0.25 | 0.5 | 1
/** note repeat rate in beats; 0 is off */
export type RepeatRate = 0 | 1 | 0.5 | 0.25 | 0.125

export type MpcState = {
  bank: number
  fullLevel: boolean
  levels: LevelsMode
  repeat: RepeatRate
  erase: boolean
  padMute: boolean
  quantize: QuantizeGrid
  chopMode: 'auto' | 'equal'
  chopSensitivity: number
  chopCount: number
  sampling: boolean
  /** where the Sample button records from */
  sampleSource: 'mic' | 'tab'
  /** tab audio share is connected and can be sampled without another dialog */
  tabAudio: boolean
}

export const defaultMpc = (): MpcState => ({
  bank: 0,
  fullLevel: false,
  levels: 'off',
  repeat: 0,
  erase: false,
  padMute: false,
  quantize: 0.25,
  chopMode: 'auto',
  chopSensitivity: 0.5,
  chopCount: 16,
  sampling: false,
  sampleSource: 'mic',
  tabAudio: false,
})

export const setMpc = (patch: Partial<MpcState>) => useStudio.setState(state => ({ mpc: { ...state.mpc, ...patch } }))

/** Velocity from where the pad was struck: bottom edge is full, top edge is soft. */
export function padVelocity(event: { clientY: number; currentTarget: Element }, fullLevel: boolean) {
  if (fullLevel) return 1
  const bounds = event.currentTarget.getBoundingClientRect()
  const position = (event.clientY - bounds.top) / Math.max(1, bounds.height)
  return Math.max(0.15, Math.min(1, 0.3 + position * 0.75))
}

/** Resolve a pad index within the current bank to what should actually sound. */
export function resolvePad(track: Track, index: number): { pad: Pad; velocity?: number; tune?: number } | undefined {
  const { mpc, selectedPadId } = useStudio.getState()
  if (mpc.levels !== 'off') {
    const pad = track.pads.find(item => item.id === selectedPadId) ?? track.pads[0]
    if (!pad) return
    if (mpc.levels === 'velocity') return { pad, velocity: (index + 1) / 16 }
    return { pad, tune: index - 8 }
  }
  const pad = padsInBank(track, mpc.bank)[index]
  return pad ? { pad } : undefined
}

/** Strike pad `index` of the current bank, honouring erase, pad-mute and 16-levels modes. */
export async function hitPad(track: Track, index: number, velocity = 1) {
  const state = useStudio.getState()
  const resolved = resolvePad(track, index)
  if (!resolved) return
  const { pad } = resolved
  if (state.mpc.padMute) {
    state.edit('Pad mute', draft => {
      const target = draft.tracks.find(item => item.id === track.id)?.pads.find(item => item.id === pad.id)
      if (target) target.mute = !target.mute
    })
    useStudio.setState({ selectedPadId: pad.id })
    return
  }
  if (state.mpc.erase) {
    erasePad(track, pad)
    useStudio.setState({ selectedPadId: pad.id })
    return
  }
  const level = state.mpc.fullLevel ? 1 : (resolved.velocity ?? velocity)
  const sounding = resolved.tune !== undefined ? { ...pad, pitchSemitones: pad.pitchSemitones + resolved.tune } : pad
  await triggerPad(track, sounding, level, pad)
  if (state.mpc.repeat > 0) startRepeat(track, sounding, level, pad)
}

// ---------- note repeat ----------
let repeatTimer: ReturnType<typeof setInterval> | undefined
let repeatNext = 0
function startRepeat(track: Track, pad: Pad, velocity: number, recordAs: Pad) {
  stopRepeat()
  const rate = useStudio.getState().mpc.repeat
  if (!rate || !engine.context || !engine.graph) return
  const project = useStudio.getState().project
  const interval = (rate * 60) / project.bpm
  const now = engine.context.currentTime
  if (engine.playing) {
    const beat = engine.positionBeats()
    const nextBeat = Math.ceil((beat + 0.01) / rate) * rate
    repeatNext = engine.timeOfBeat(nextBeat)
  } else repeatNext = now + interval
  repeatTimer = setInterval(() => {
    const context = engine.context!
    const current = useStudio.getState()
    const velocityNow = current.mpc.fullLevel ? 1 : velocity
    while (repeatNext < context.currentTime + 0.12) {
      if (repeatNext >= context.currentTime - 0.01) {
        engine.graph!.trigger(track, pad, repeatNext, velocityNow, current.project.bpm)
        engine.events.push({ time: repeatNext, padId: recordAs.id })
        if (current.recording && engine.playing) {
          const beat = engine.positionBeats() + (repeatNext - context.currentTime) * (current.project.bpm / 60)
          recordHit(track, recordAs, velocityNow, beat)
        }
      }
      repeatNext += (useStudio.getState().mpc.repeat * 60) / current.project.bpm || interval
    }
  }, 25)
}
export function stopRepeat() {
  clearInterval(repeatTimer)
  repeatTimer = undefined
}

// ---------- erase ----------
export function erasePad(track: Track, pad: Pad) {
  const state = useStudio.getState()
  state.edit('Erase pad steps', draft => {
    const pattern = draft.patterns.find(item => item.id === state.patternId)
    const row = pattern?.trackSteps.find(item => item.trackId === track.id)
    const sequencerPad = draft.tracks.find(item => item.id === track.id)?.sequencerPadId
    for (const step of row?.steps ?? []) {
      const stepPad = step.padId ?? sequencerPad
      if (stepPad === pad.id) Object.assign(step, makeStep())
    }
  })
}
export function clearTrack(track: Track) {
  const state = useStudio.getState()
  state.edit('Clear track steps', draft => {
    const row = draft.patterns
      .find(item => item.id === state.patternId)
      ?.trackSteps.find(item => item.trackId === track.id)
    row?.steps.forEach(step => Object.assign(step, makeStep()))
  })
}
export function clearPattern() {
  const state = useStudio.getState()
  state.edit('Clear pattern', draft => {
    draft.patterns
      .find(item => item.id === state.patternId)
      ?.trackSteps.forEach(row => row.steps.forEach(step => Object.assign(step, makeStep())))
  })
}

// ---------- tap tempo ----------
let taps: number[] = []
export function tapTempo() {
  const now = performance.now()
  if (taps.length && now - taps[taps.length - 1] > 2000) taps = []
  taps.push(now)
  if (taps.length > 6) taps.shift()
  if (taps.length < 2) return null
  const intervals = taps.slice(1).map((time, index) => time - taps[index])
  const average = intervals.reduce((sum, value) => sum + value, 0) / intervals.length
  const bpm = Math.round(60000 / average)
  setTempo(bpm)
  return bpm
}

// ---------- chopping ----------
export function chop(track: Track, mode: 'auto' | 'equal', options: { sensitivity?: number; count?: number } = {}) {
  const buffer = engine.buffers.get(track.sampleBufferId)
  if (!buffer) return
  const starts =
    mode === 'equal'
      ? equalSlices(buffer.duration, options.count ?? 16)
      : detectSlices(
          buffer.getChannelData(0),
          buffer.sampleRate,
          Math.max(16, track.pads.length),
          options.sensitivity ?? 0.5,
        )
  const state = useStudio.getState()
  state.edit(mode === 'equal' ? 'Chop into equal regions' : 'Auto-chop sample', draft =>
    assignSample(draft, track.id, track.sampleBufferId, buffer.duration, starts),
  )
  useStudio.setState({
    selectedPadId: useStudio.getState().project.tracks.find(item => item.id === track.id)?.pads[0].id ?? '',
  })
  return starts.length
}

/** Make the selected pad's IN point a new slice boundary (manual chop). */
export function splitPadAtMarker(track: Track, pad: Pad) {
  const buffer = engine.buffers.get(track.sampleBufferId)
  if (!buffer) return
  const starts = [...new Set(track.pads.map(item => item.startTime).concat(pad.startTime))].sort((a, b) => a - b)
  useStudio
    .getState()
    .edit('Add slice', draft => assignSample(draft, track.id, track.sampleBufferId, buffer.duration, starts))
}

// ---------- sampling (record from input or tab audio into a track) ----------
let samplingStart = 0
let samplingTimer: ReturnType<typeof setTimeout> | undefined

/** Ask the browser to share this tab's audio so the backing video can be sampled. */
export async function connectTabAudio() {
  try {
    await engine.ready()
    const recorder = engine.recorder!
    await recorder.openTabAudio()
    recorder.onEnded = () => setMpc({ tabAudio: false, sampling: false, sampleSource: 'mic' })
    setMpc({ tabAudio: true, sampleSource: 'tab' })
    notify('Tab audio connected. Play the video and press Sample, or set IN / OUT and sample the region.')
    return true
  } catch (error) {
    setMpc({ tabAudio: false })
    reportError(error instanceof Error && error.name === 'NotAllowedError' ? 'Tab audio sharing was cancelled.' : error)
    return false
  }
}
export function releaseTabAudio() {
  const recorder = engine.recorder
  if (recorder?.source === 'tab') recorder.close()
  setMpc({ tabAudio: false, sampleSource: 'mic', sampling: false })
}

export async function startSampling(source: 'mic' | 'tab' = useStudio.getState().mpc.sampleSource) {
  try {
    await engine.ready()
    const recorder = engine.recorder!
    if (source === 'tab') {
      if (recorder.source !== 'tab' && !(await connectTabAudio())) return false
      // keep our own pads out of the capture
      engine.graph?.setOutputMuted(true)
    } else if (recorder.source !== 'mic') {
      await recorder.open(undefined, useStudio.getState().inputDeviceId || undefined)
    }
    recorder.start()
    samplingStart = engine.context!.currentTime
    setMpc({ sampling: true, sampleSource: source })
    return true
  } catch (error) {
    reportError(error instanceof Error && error.name === 'NotAllowedError' ? 'Microphone access was denied.' : error)
    return false
  }
}

export async function stopSampling(track: Track, toNewTrack: boolean, name?: string) {
  clearTimeout(samplingTimer)
  const recorder = engine.recorder
  const source = useStudio.getState().mpc.sampleSource
  setMpc({ sampling: false })
  engine.graph?.setOutputMuted(false)
  if (!recorder) return
  const result = recorder.finish(samplingStart)
  if (recorder.source === 'mic' && !useStudio.getState().inputArmed) recorder.close()
  if (!result || result.buffer.duration < 0.05) {
    notify(
      source === 'tab'
        ? 'Nothing was captured. Make sure the video is playing and tab audio is shared.'
        : 'Nothing was recorded.',
    )
    return
  }
  const peak = result.buffer.getChannelData(0).reduce((max, value) => Math.max(max, Math.abs(value)), 0)
  if (peak < 0.001) {
    notify(
      source === 'tab'
        ? 'The capture was silent. Was the video playing with its sound on?'
        : 'The recording was silent.',
    )
    return
  }
  const bufferId = uid()
  engine.register(bufferId, result.buffer, result.blob)
  const starts = detectSlices(
    result.buffer.getChannelData(0),
    result.buffer.sampleRate,
    16,
    useStudio.getState().mpc.chopSensitivity,
  )
  const state = useStudio.getState()
  let targetId = track.id
  state.edit(toNewTrack ? 'Sample to new track' : 'Record sample', draft => {
    if (toNewTrack) {
      const created = makeTrack(
        'drums',
        name ?? `Sample ${draft.tracks.filter(item => item.kind === 'drums').length + 1}`,
        draft.tracks.length,
        bufferId,
      )
      targetId = created.id
      draft.tracks.push(created)
      for (const pattern of draft.patterns)
        pattern.trackSteps.push({
          trackId: created.id,
          steps: Array.from({ length: pattern.bars * stepsPerBar(draft) }, makeStep),
        })
    }
    assignSample(draft, targetId, bufferId, result.buffer.duration, starts)
  })
  const target = useStudio.getState().project.tracks.find(item => item.id === targetId)
  if (target) selectTrack(target)
  notify(`Sampled ${result.buffer.duration.toFixed(2)} s into ${target?.name ?? 'track'} (${starts.length} slices).`)
}

/**
 * Sample a cue region of the backing video: seek, play, capture exactly (out - in) seconds,
 * then pause and chop onto the kit.
 */
export async function sampleVideoRegion(
  track: Track,
  toNewTrack: boolean,
  video: {
    seek: (seconds: number) => void
    play: () => void
    pause: () => void
    waitForPlaying: (ms?: number) => Promise<void>
  },
  cueIn: number,
  cueOut: number,
  name?: string,
) {
  const length = cueOut - cueIn
  if (length <= 0.05) {
    reportError('Set an OUT point after the IN point first.')
    return
  }
  if (length > 60) {
    reportError('Sample regions are limited to 60 seconds.')
    return
  }
  video.pause()
  video.seek(cueIn)
  video.play()
  await video.waitForPlaying(2000)
  if (!(await startSampling('tab'))) {
    video.pause()
    return
  }
  samplingTimer = setTimeout(() => {
    video.pause()
    void stopSampling(track, toNewTrack, name)
  }, length * 1000)
}

// ---------- resample the current pattern into a new track ----------
export async function resamplePattern() {
  const state = useStudio.getState()
  const pattern = state.project.patterns.find(item => item.id === state.patternId)
  if (!pattern) return
  try {
    const steps = pattern.bars * stepsPerBar(state.project)
    const length = steps * stepDuration(state.project.bpm)
    const context = new OfflineAudioContext(2, Math.ceil((length + 1) * 44100), 44100)
    const graph = new AudioGraph(context, engine.buffers)
    const project = { ...state.project, metronome: false }
    graph.sync(project)
    for (let index = 0; index < steps; index++)
      scheduleStep(
        { project, graph, mode: 'pattern', patternId: pattern.id, origin: 0 },
        index,
        index * stepDuration(project.bpm),
      )
    const rendered = await context.startRendering()
    const blob = encodeWav(rendered)
    const bufferId = uid()
    engine.register(bufferId, rendered, blob)
    const starts = equalSlices(length, Math.min(16, steps))
    let targetId = ''
    state.edit('Resample pattern', draft => {
      const created = makeTrack('drums', `${pattern.name} resample`, draft.tracks.length, bufferId)
      targetId = created.id
      draft.tracks.push(created)
      for (const item of draft.patterns)
        item.trackSteps.push({
          trackId: created.id,
          steps: Array.from({ length: item.bars * stepsPerBar(draft) }, makeStep),
        })
      assignSample(draft, created.id, bufferId, rendered.duration, starts)
    })
    const target = useStudio.getState().project.tracks.find(item => item.id === targetId)
    if (target) selectTrack(target)
    notify(`Resampled ${pattern.name} onto a new track.`)
  } catch (error) {
    reportError(error)
  }
}

export function duplicateTrack(trackId: string) {
  const state = useStudio.getState()
  let id = ''
  state.edit('Duplicate track', draft => {
    const source = draft.tracks.find(item => item.id === trackId)
    if (!source) return
    const copy = JSON.parse(JSON.stringify(source)) as Track
    copy.id = uid()
    copy.name = `${source.name} copy`
    copy.pads = copy.pads.map(pad => ({ ...pad, id: uid() }))
    copy.sequencerPadId = copy.pads[0]?.id ?? ''
    copy.effects = copy.effects.map(effect => ({ ...effect, id: uid() }))
    id = copy.id
    draft.tracks.splice(draft.tracks.indexOf(source) + 1, 0, copy)
    for (const pattern of draft.patterns) {
      const index = pattern.trackSteps.findIndex(row => row.trackId === trackId)
      pattern.trackSteps.splice(index + 1, 0, {
        trackId: copy.id,
        steps: Array.from({ length: pattern.bars * stepsPerBar(draft) }, makeStep),
      })
    }
  })
  const track = useStudio.getState().project.tracks.find(item => item.id === id)
  if (track) selectTrack(track)
}
