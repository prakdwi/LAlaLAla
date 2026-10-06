import { engine } from '../audio/engine'
import { stepTime, stepDuration } from '../audio/timing'
import { midi, type MidiMessage } from '../audio/midi'
import { notify, reportError, useStudio } from './store'
import { makeEffect, makePattern, makeStep, makeTrack, stepsPerBar, uid } from './defaults'
import { snapBeat } from './arrangement'
import type { AudioClip, AutomationTarget, Clip, MidiClip, Pad, Project, Track, TrackKind } from './types'

export const padKeys = '1234qwerasdfzxcv'

export function selectTrack(track: Track) {
  useStudio.setState({ selectedTrackId: track.id, selectedPadId: track.pads[0]?.id ?? '' })
}
export function selectClip(clip: Clip | undefined) {
  if (!clip) {
    useStudio.setState({ selectedClipId: '' })
    return
  }
  const patch: Partial<ReturnType<typeof useStudio.getState>> = { selectedClipId: clip.id, selectedLaneId: clip.laneId }
  if (clip.kind === 'pattern') patch.patternId = clip.patternId
  if (clip.kind === 'midi' || clip.kind === 'audio') {
    const track = useStudio.getState().project.tracks.find(item => item.id === clip.trackId)
    if (track) {
      patch.selectedTrackId = track.id
      patch.selectedPadId = track.pads[0]?.id ?? ''
    }
  }
  useStudio.setState(patch)
}

/** Nearest sixteenth step to the current pattern position, for live recording. */
function nearestPatternStep(project: Project, patternSteps: number) {
  const elapsed = engine.context!.currentTime - engine.origin
  const barLength = stepTime(patternSteps, project.bpm, 0)
  const position = ((elapsed % barLength) + barLength) % barLength
  let nearest = 0
  let distance = Infinity
  for (let index = 0; index <= patternSteps; index++) {
    const delta = Math.abs(stepTime(index, project.bpm, project.swing) - position)
    if (delta < distance) {
      distance = delta
      nearest = index % patternSteps
    }
  }
  return nearest
}

export async function triggerPad(track: Track, pad: Pad, velocity = 1) {
  const state = useStudio.getState()
  useStudio.setState({ selectedPadId: pad.id })
  try {
    await engine.hit(state.project, track, pad, velocity)
    if (state.recording && engine.playing && !state.songMode && engine.positionBeats() >= 0) {
      const pattern = state.project.patterns.find(item => item.id === state.patternId)
      if (!pattern) return
      const nearest = nearestPatternStep(state.project, pattern.bars * stepsPerBar(state.project))
      state.edit('Record pad', project => {
        const step = project.patterns
          .find(item => item.id === pattern.id)
          ?.trackSteps.find(row => row.trackId === track.id)?.steps[nearest]
        if (step) {
          step.active = true
          step.padId = pad.id
          step.velocity = velocity
        }
      })
    }
  } catch (error) {
    reportError(error)
  }
}

const heldNotes = new Map<string, { clipId: string; noteId: string }>()

function laneForTrack(project: Project, track: Track) {
  const existing = project.clips.find(
    clip => (clip.kind === 'midi' || clip.kind === 'audio') && clip.trackId === track.id,
  )
  if (existing) return existing.laneId
  const lane = { id: uid(), name: track.name }
  project.lanes.push(lane)
  return lane.id
}

/** The MIDI clip on `track` that covers `beat`, creating a one-bar clip at the bar start when none does. */
function midiClipAt(project: Project, track: Track, beat: number): MidiClip {
  const existing = project.clips.find(
    (clip): clip is MidiClip =>
      clip.kind === 'midi' && clip.trackId === track.id && beat >= clip.start && beat < clip.start + clip.length,
  )
  if (existing) return existing
  const bar = project.timeSignature.beats
  const start = Math.floor(beat / bar) * bar
  const clip: MidiClip = {
    id: uid(),
    kind: 'midi',
    name: `${track.name} take`,
    laneId: laneForTrack(project, track),
    start,
    length: bar,
    muted: false,
    trackId: track.id,
    notes: [],
    loopLength: bar,
  }
  project.clips.push(clip)
  return clip
}

export async function noteOn(track: Track, pitch: number, velocity = 1) {
  const state = useStudio.getState()
  if (track.kind === 'audio' || track.kind === 'bus') return
  try {
    await engine.noteOn(state.project, track, pitch, velocity)
    if (!state.recording || !engine.playing) return
    const beat = engine.positionBeats()
    if (beat < 0) return
    if (!state.songMode) {
      const pattern = state.project.patterns.find(item => item.id === state.patternId)
      if (!pattern) return
      const nearest = nearestPatternStep(state.project, pattern.bars * stepsPerBar(state.project))
      state.edit('Record note', project => {
        const step = project.patterns
          .find(item => item.id === pattern.id)
          ?.trackSteps.find(row => row.trackId === track.id)?.steps[nearest]
        if (step) {
          step.active = true
          step.velocity = velocity
        }
      })
      return
    }
    const noteId = uid()
    const quantized = state.quantize ? snapBeat(beat, 0.25) : beat
    let clipId = ''
    state.edit(
      'Record note',
      project => {
        const clip = midiClipAt(project, track, quantized)
        clipId = clip.id
        clip.notes.push({ id: noteId, pitch, start: Math.max(0, quantized - clip.start), length: 0.25, velocity })
      },
      `record-${track.id}`,
    )
    heldNotes.set(`${track.id}:${pitch}`, { clipId, noteId })
  } catch (error) {
    reportError(error)
  }
}

export function noteOff(track: Track, pitch: number) {
  engine.noteOff(track, pitch)
  const held = heldNotes.get(`${track.id}:${pitch}`)
  if (!held) return
  heldNotes.delete(`${track.id}:${pitch}`)
  const beat = engine.positionBeats()
  if (beat < 0) return
  const state = useStudio.getState()
  state.edit(
    'Note length',
    project => {
      const clip = project.clips.find((item): item is MidiClip => item.id === held.clipId && item.kind === 'midi')
      const note = clip?.notes.find(item => item.id === held.noteId)
      if (!clip || !note) return
      const end = state.quantize ? snapBeat(beat, 0.25) : beat
      note.length = Math.max(0.25, end - clip.start - note.start)
      if (note.start + note.length > clip.length) {
        const bar = project.timeSignature.beats
        clip.length = Math.ceil((note.start + note.length) / bar) * bar
        clip.loopLength = clip.length
      }
    },
    `record-${track.id}`,
  )
}

export function handleMidi(message: MidiMessage) {
  const state = useStudio.getState()
  const track = state.project.tracks.find(item => item.id === state.selectedTrackId)
  if (!track || !state.ready) return
  if (message.type === 'noteon') {
    if (track.kind === 'drums') {
      const pad = track.pads[(message.pitch - 36 + 16 * 8) % 16]
      if (pad) void triggerPad(track, pad, message.velocity)
    } else void noteOn(track, message.pitch, message.velocity)
  } else if (message.type === 'noteoff' && track.kind !== 'drums') noteOff(track, message.pitch)
}

export async function enableMidi() {
  midi.onChange = () => useStudio.setState({ midiStatus: midi.status, midiInputs: midi.inputs })
  const ok = await midi.enable()
  if (ok)
    notify(
      midi.inputs.length
        ? `MIDI ready: ${midi.inputs.map(input => input.name).join(', ')}`
        : 'MIDI ready. Connect a controller.',
    )
  return ok
}
midi.subscribe(handleMidi)

export async function play(songMode = false, options: { fromBeat?: number; countIn?: boolean } = {}) {
  const state = useStudio.getState()
  try {
    const countInBars = options.countIn && state.recording ? state.project.countInBars : 0
    const fromBeat =
      options.fromBeat ?? (songMode ? Math.max(0, state.positionBeats >= 0 ? state.positionBeats : 0) : 0)
    const armed =
      state.inputArmed && songMode && state.recording
        ? state.project.tracks.find(track => track.id === state.selectedTrackId)
        : undefined
    const origin = await engine.play(() => useStudio.getState().project, state.patternId, songMode, {
      fromBeat: songMode ? fromBeat : 0,
      countInBars,
    })
    if (armed && armed.kind === 'audio' && engine.recorder?.active) {
      engine.recorder.start()
      recordingSession = {
        trackId: armed.id,
        startBeat: Math.round(fromBeat * 4) / 4,
        startTime: engine.timeOfBeat(fromBeat),
      }
      useStudio.setState({ recordingAudio: true })
    }
    useStudio.setState({
      playing: engine.playing,
      songMode,
      playhead: -1,
      positionBeats: songMode ? fromBeat : 0,
      clockKind: engine.clockKind,
    })
    return origin
  } catch (error) {
    reportError(error)
  }
}

let recordingSession: { trackId: string; startBeat: number; startTime: number } | null = null

export function stop() {
  const session = recordingSession
  recordingSession = null
  const state = useStudio.getState()
  if (session && engine.recorder) {
    const result = engine.recorder.finish(session.startTime)
    if (result) {
      const bufferId = uid()
      engine.register(bufferId, result.buffer, result.blob)
      const seconds = result.buffer.duration
      const beats = Math.max(0.25, (seconds * state.project.bpm) / 60)
      state.edit('Record audio', project => {
        const track = project.tracks.find(item => item.id === session.trackId)
        if (!track) return
        const clip: AudioClip = {
          id: uid(),
          kind: 'audio',
          name: `${track.name} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          laneId: laneForTrack(project, track),
          start: session.startBeat,
          length: Math.round(beats * 4) / 4,
          muted: false,
          trackId: track.id,
          bufferId,
          offset: 0,
          gain: 1,
          fadeIn: 0.005,
          fadeOut: 0.01,
          pitchSemitones: 0,
        }
        project.clips.push(clip)
      })
      notify(`Recorded ${seconds.toFixed(1)} s of audio.`)
    }
  }
  heldNotes.clear()
  engine.stop()
  useStudio.setState({ playing: false, recording: false, recordingAudio: false, playhead: -1, positionBeats: -1 })
}

export function togglePlay(songMode = useStudio.getState().songMode) {
  if (engine.playing) stop()
  else void play(songMode)
}

export function seek(beat: number) {
  const state = useStudio.getState()
  const target = Math.max(0, beat)
  if (engine.playing && state.songMode) engine.seek(target)
  useStudio.setState({ positionBeats: target })
}

export function setTempo(bpm: number) {
  const state = useStudio.getState()
  const clamped = Math.max(40, Math.min(240, Math.round(bpm) || 40))
  state.edit(
    'Tempo',
    project => {
      project.bpm = clamped
    },
    'bpm',
  )
  engine.setTempo(clamped, state.project.swing)
}
export function setSwing(swing: number) {
  const state = useStudio.getState()
  state.edit(
    'Swing',
    project => {
      project.swing = swing
    },
    'swing',
  )
  engine.setTempo(state.project.bpm, swing)
}

export function toggleRecord() {
  const state = useStudio.getState()
  if (state.songMode && engine.playing) stop()
  const recording = !state.recording
  useStudio.setState({ recording })
  if (recording && !engine.playing) void play(state.songMode, { countIn: true })
}

export function addTrack(kind: TrackKind) {
  const state = useStudio.getState()
  const count = state.project.tracks.filter(track => track.kind === kind).length + 1
  const names: Record<TrackKind, string> = { drums: 'Drums', keys: 'Keys', synth: 'Synth', audio: 'Audio', bus: 'Bus' }
  let id = ''
  state.edit('Add track', project => {
    const track = makeTrack(
      kind,
      `${names[kind]} ${count}`,
      project.tracks.length,
      kind === 'drums' || kind === 'keys' ? 'factory-3' : '',
    )
    if (kind === 'bus') track.effects = [makeEffect('reverb', true), makeEffect('eq')]
    if (kind === 'keys') {
      track.pads[0].endTime = 1.2
      track.rootNote = 48
    }
    id = track.id
    project.tracks.push(track)
    for (const pattern of project.patterns)
      pattern.trackSteps.push({
        trackId: track.id,
        steps: Array.from({ length: pattern.bars * stepsPerBar(project) }, makeStep),
      })
  })
  const track = useStudio.getState().project.tracks.find(item => item.id === id)
  if (track) selectTrack(track)
  return id
}

export function removeTrack(trackId: string) {
  const state = useStudio.getState()
  if (state.project.tracks.length <= 1) {
    reportError('A project needs at least one track.')
    return
  }
  stop()
  state.edit('Remove track', project => {
    project.tracks = project.tracks.filter(track => track.id !== trackId)
    for (const track of project.tracks) {
      track.sends = track.sends.filter(send => send.busId !== trackId)
      if (track.outputBusId === trackId) delete track.outputBusId
    }
    for (const pattern of project.patterns)
      pattern.trackSteps = pattern.trackSteps.filter(row => row.trackId !== trackId)
    project.clips = project.clips.filter(clip => {
      if (clip.kind === 'midi' || clip.kind === 'audio') return clip.trackId !== trackId
      if (clip.kind === 'automation') return clip.target.kind === 'master' || clip.target.trackId !== trackId
      return true
    })
  })
  const next = useStudio.getState().project.tracks[0]
  if (useStudio.getState().selectedTrackId === trackId) selectTrack(next)
}

export function moveTrack(trackId: string, direction: -1 | 1) {
  useStudio.getState().edit('Reorder tracks', project => {
    const index = project.tracks.findIndex(track => track.id === trackId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= project.tracks.length) return
    const [track] = project.tracks.splice(index, 1)
    project.tracks.splice(target, 0, track)
    for (const pattern of project.patterns) {
      const rowIndex = pattern.trackSteps.findIndex(row => row.trackId === trackId)
      if (rowIndex < 0) continue
      const [row] = pattern.trackSteps.splice(rowIndex, 1)
      pattern.trackSteps.splice(target, 0, row)
    }
  })
}

export function setPatternBars(patternId: string, bars: number) {
  const state = useStudio.getState()
  const target = Math.max(1, Math.min(16, Math.round(bars)))
  state.edit('Pattern length', project => {
    const pattern = project.patterns.find(item => item.id === patternId)
    if (!pattern) return
    const wanted = target * stepsPerBar(project)
    for (const row of pattern.trackSteps) {
      while (row.steps.length < wanted)
        row.steps.push(
          ...row.steps.slice(0, Math.min(row.steps.length, wanted - row.steps.length)).map(step => ({ ...step })),
        )
      row.steps.length = wanted
    }
    pattern.bars = target
  })
  engine.setLoop(useStudio.getState().project)
}

export function setTimeSignature(beats: number) {
  const state = useStudio.getState()
  stop()
  state.edit('Time signature', project => {
    const previous = stepsPerBar(project)
    project.timeSignature = { beats: Math.max(2, Math.min(7, Math.round(beats))), unit: 4 }
    const next = stepsPerBar(project)
    for (const pattern of project.patterns)
      for (const row of pattern.trackSteps) {
        const wanted = pattern.bars * next
        if (row.steps.length < wanted) row.steps.push(...Array.from({ length: wanted - row.steps.length }, makeStep))
        row.steps.length = wanted
      }
    if (previous !== next) project.loop.end = Math.max(project.timeSignature.beats, project.loop.end)
  })
}

export function createPattern(copyFromId?: string, bars?: number) {
  const state = useStudio.getState()
  const source = state.project.patterns.find(item => item.id === copyFromId)
  let id = ''
  state.edit(source ? 'Duplicate pattern' : 'New pattern', project => {
    const pattern = makePattern(
      project,
      `Pattern ${String.fromCharCode(65 + (project.patterns.length % 26))}`,
      bars ?? source?.bars ?? 1,
    )
    if (source)
      pattern.trackSteps = source.trackSteps.map(row => ({
        trackId: row.trackId,
        steps: row.steps.map(step => ({ ...step })),
      }))
    id = pattern.id
    project.patterns.push(pattern)
  })
  stop()
  useStudio.setState({ patternId: id })
  return id
}

export function deletePattern(patternId: string) {
  const state = useStudio.getState()
  if (state.project.patterns.length <= 1) {
    reportError('A project needs at least one pattern.')
    return
  }
  stop()
  state.edit('Delete pattern', project => {
    project.patterns = project.patterns.filter(item => item.id !== patternId)
    project.clips = project.clips.filter(clip => clip.kind !== 'pattern' || clip.patternId !== patternId)
    if (project.jamPatternId === patternId) delete project.jamPatternId
  })
  if (useStudio.getState().patternId === patternId)
    useStudio.setState({ patternId: useStudio.getState().project.patterns[0].id })
}

export function addLane(name = `Lane ${useStudio.getState().project.lanes.length + 1}`) {
  let id = ''
  useStudio.getState().edit('Add lane', project => {
    id = uid()
    project.lanes.push({ id, name })
  })
  useStudio.setState({ selectedLaneId: id })
  return id
}
export function removeLane(laneId: string) {
  const state = useStudio.getState()
  if (state.project.lanes.length <= 1) return
  state.edit('Remove lane', project => {
    project.lanes = project.lanes.filter(lane => lane.id !== laneId)
    project.clips = project.clips.filter(clip => clip.laneId !== laneId)
  })
  if (useStudio.getState().selectedLaneId === laneId)
    useStudio.setState({ selectedLaneId: useStudio.getState().project.lanes[0].id })
}

export function addClip(
  kind: Clip['kind'],
  laneId: string,
  start: number,
  options: { patternId?: string; trackId?: string; target?: AutomationTarget } = {},
) {
  const state = useStudio.getState()
  const bar = state.project.timeSignature.beats
  let id = ''
  state.edit('Add clip', project => {
    id = uid()
    const base = { id, laneId, start: Math.max(0, start), muted: false }
    if (kind === 'pattern') {
      const pattern =
        project.patterns.find(item => item.id === (options.patternId ?? state.patternId)) ?? project.patterns[0]
      project.clips.push({
        ...base,
        kind: 'pattern',
        name: pattern.name,
        length: pattern.bars * bar,
        patternId: pattern.id,
      })
    } else if (kind === 'midi') {
      const track = project.tracks.find(item => item.id === (options.trackId ?? state.selectedTrackId))
      if (!track) return
      project.clips.push({
        ...base,
        kind: 'midi',
        name: `${track.name} clip`,
        length: bar,
        trackId: track.id,
        notes: [],
        loopLength: bar,
      })
    } else if (kind === 'automation' && options.target) {
      project.clips.push({
        ...base,
        kind: 'automation',
        name: 'Automation',
        length: bar * 2,
        target: options.target,
        points: [],
      })
    }
  })
  const clip = useStudio.getState().project.clips.find(item => item.id === id)
  if (clip) selectClip(clip)
  return id
}

export function deleteClip(clipId: string) {
  useStudio.getState().edit('Delete clip', project => {
    project.clips = project.clips.filter(clip => clip.id !== clipId)
  })
  if (useStudio.getState().selectedClipId === clipId) useStudio.setState({ selectedClipId: '' })
}

export function toggleMetronome() {
  useStudio.getState().edit('Metronome', project => {
    project.metronome = !project.metronome
  })
}

export function setLoopRegion(loop: Partial<Project['loop']>) {
  useStudio.getState().edit(
    'Loop',
    project => {
      Object.assign(project.loop, loop)
      if (project.loop.end <= project.loop.start) project.loop.end = project.loop.start + project.timeSignature.beats
    },
    'loop',
  )
  engine.setLoop(useStudio.getState().project)
}

export async function armInput(enabled: boolean) {
  const state = useStudio.getState()
  const track = state.project.tracks.find(item => item.id === state.selectedTrackId)
  try {
    if (!enabled || !track) {
      engine.recorder?.close()
      useStudio.setState({ inputArmed: false })
      return
    }
    await engine.ready()
    await engine.recorder!.open(engine.graph!.inputFor(track.id), state.inputDeviceId || undefined)
    engine.recorder!.setMonitor(Boolean(track.monitor))
    const devices = await (await import('../audio/recorder')).InputRecorder.devices()
    useStudio.setState({
      inputArmed: true,
      inputDevices: devices.map(device => ({ id: device.deviceId, label: device.label || 'Microphone' })),
    })
    notify(`Input armed on ${track.name}. Press record, then play.`)
  } catch (error) {
    useStudio.setState({ inputArmed: false })
    reportError(error instanceof Error && error.name === 'NotAllowedError' ? 'Microphone access was denied.' : error)
  }
}

export const stepSeconds = (project: Project) => stepDuration(project.bpm)
