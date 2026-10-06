import { useEffect, useRef } from 'react'
import { Circle, Mic, Play, Repeat, Square, Timer, Music4 } from 'lucide-react'
import { engine } from '../audio/engine'
import { useStudio } from '../state/store'
import {
  armInput,
  enableMidi,
  play,
  setLoopRegion,
  setSwing,
  setTempo,
  setTimeSignature,
  stop,
  toggleMetronome,
  toggleRecord,
} from '../state/actions'
import { IconButton } from './Controls'

export function Transport() {
  const {
    project,
    edit,
    playing,
    recording,
    playhead,
    positionBeats,
    ready,
    songMode,
    inputArmed,
    recordingAudio,
    midiStatus,
    midiInputs,
    selectedTrackId,
    clockKind,
  } = useStudio()
  const meter = useRef<HTMLCanvasElement>(null)
  const track = project.tracks.find(item => item.id === selectedTrackId)
  useEffect(() => {
    let frame = 0
    const data = new Float32Array(256)
    const draw = () => {
      const canvas = meter.current
      const context = canvas?.getContext('2d')
      if (canvas && context) {
        engine.graph?.analyser.getFloatTimeDomainData(data)
        const rms = Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length)
        const level = Math.max(0, Math.min(1, (20 * Math.log10(rms || 0.00001) + 60) / 60))
        context.clearRect(0, 0, canvas.width, canvas.height)
        for (let index = 0; index < 28; index++) {
          context.fillStyle = index / 28 < level ? (index > 24 ? '#c4583a' : '#8abb43') : '#38382a'
          context.fillRect(index * 5, 0, 3, 14)
        }
        canvas.dataset.level = rms.toFixed(5)
      }
      frame = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(frame)
  }, [])
  const beatsPerBar = project.timeSignature.beats
  const beat = songMode ? positionBeats : playhead >= 0 ? playhead / 4 : -1
  const bar =
    beat >= 0 ? Math.floor(beat / beatsPerBar) + 1 : beat < 0 && playing ? Math.floor(beat / beatsPerBar) + 1 : 1
  const beatInBar = beat >= 0 ? (Math.floor(beat) % beatsPerBar) + 1 : 1
  const sixteenth = beat >= 0 ? Math.floor((beat % 1) * 4) + 1 : 1
  return (
    <div className="transport">
      <div className="transport-buttons">
        <button
          className={`play-button ${playing ? 'running' : ''}`}
          aria-label={playing ? 'Stop playback' : 'Play pattern'}
          disabled={!ready}
          onClick={() => (playing ? stop() : void play(false))}
        >
          <Play size={17} fill="currentColor" />
          {playing ? 'Playing' : 'Play'}
        </button>
        <IconButton title="Stop" onClick={stop}>
          <Square size={16} fill="currentColor" />
        </IconButton>
        <IconButton
          title="Record pads into pattern"
          disabled={!ready}
          aria-pressed={recording}
          className={`icon-button ${recording ? 'recording' : ''}`}
          onClick={toggleRecord}
        >
          <Circle size={17} fill={recording ? 'currentColor' : 'none'} />
        </IconButton>
      </div>
      <div className="position" title={songMode ? 'Song position' : 'Pattern position'}>
        <strong>
          {String(Math.max(bar, playing && beat < 0 ? bar : 1)).padStart(2, '0')}
          <span> : </span>
          {String(beatInBar).padStart(2, '0')}
          <span> : </span>
          {String(sixteenth).padStart(2, '0')}
        </strong>
        <small>
          {playing && beat < 0
            ? 'COUNT-IN'
            : recordingAudio
              ? 'AUDIO RECORDING'
              : recording
                ? 'RECORDING'
                : songMode
                  ? 'SONG'
                  : `${beatsPerBar} / 4 PATTERN`}
        </small>
      </div>
      <label className="tempo">
        <input
          aria-label="BPM"
          type="number"
          min="40"
          max="240"
          value={project.bpm}
          onChange={event => setTempo(Number(event.target.value))}
        />
        <span>BPM</span>
      </label>
      <label className="time-signature">
        <select
          aria-label="Time signature"
          value={project.timeSignature.beats}
          onChange={event => setTimeSignature(Number(event.target.value))}
        >
          {[2, 3, 4, 5, 6, 7].map(beats => (
            <option key={beats} value={beats}>
              {beats}/4
            </option>
          ))}
        </select>
      </label>
      <label className="swing">
        Swing <output>{Math.round(project.swing * 100)}%</output>
        <input
          aria-label="Swing"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={project.swing}
          onChange={event => setSwing(Number(event.target.value))}
        />
      </label>
      <div className="transport-toggles">
        <button
          className={`toggle ${project.metronome ? 'on' : ''}`}
          aria-pressed={project.metronome}
          onClick={toggleMetronome}
          title="Metronome"
        >
          <Timer size={13} />
          Click
        </button>
        <label className="count-in" title="Count-in bars before recording">
          <select
            aria-label="Count-in bars"
            value={project.countInBars}
            onChange={event =>
              edit('Count-in', draft => {
                draft.countInBars = Number(event.target.value)
              })
            }
          >
            {[0, 1, 2].map(bars => (
              <option key={bars} value={bars}>
                {bars ? `${bars} bar${bars > 1 ? 's' : ''} in` : 'No count-in'}
              </option>
            ))}
          </select>
        </label>
        <button
          className={`toggle ${project.loop.enabled ? 'on' : ''}`}
          aria-pressed={project.loop.enabled}
          onClick={() => setLoopRegion({ enabled: !project.loop.enabled })}
          title="Loop region"
        >
          <Repeat size={13} />
          Loop
        </button>
        <button
          className={`toggle ${inputArmed ? 'on armed' : ''}`}
          aria-pressed={inputArmed}
          disabled={!ready || track?.kind !== 'audio'}
          onClick={() => void armInput(!inputArmed)}
          title={
            track?.kind === 'audio'
              ? 'Arm microphone input on the selected audio track'
              : 'Select an audio track to arm input'
          }
        >
          <Mic size={13} />
          {inputArmed ? 'Armed' : 'Arm'}
        </button>
        <button
          className={`toggle ${midiStatus === 'ready' ? 'on' : ''}`}
          aria-pressed={midiStatus === 'ready'}
          onClick={() => void enableMidi()}
          title={
            midiStatus === 'ready'
              ? midiInputs.map(input => input.name).join(', ') || 'No MIDI devices connected'
              : midiStatus === 'unsupported'
                ? 'Web MIDI is not supported in this browser'
                : 'Enable MIDI input'
          }
        >
          <Music4 size={13} />
          {midiStatus === 'ready' ? `MIDI ${midiInputs.length}` : 'MIDI'}
        </button>
      </div>
      <div className="master-meter">
        <span>
          MASTER{' '}
          <small>
            -60 <span>0 dB</span>
          </small>
        </span>
        <canvas ref={meter} width="140" height="14" aria-label="Live master level" />
        <input
          aria-label="Master volume"
          type="range"
          min="0"
          max="1.2"
          step="0.01"
          value={project.masterVolume}
          onChange={event =>
            edit(
              'Master volume',
              draft => {
                draft.masterVolume = Number(event.target.value)
              },
              'master',
            )
          }
        />
      </div>
      <div className="engine-status">
        <i className={playing ? 'live' : ''} />
        {playing ? 'AUDIO RUNNING' : 'ENGINE READY'}
        <small>{clockKind === 'worklet' ? 'WORKLET CLOCK' : 'WEB AUDIO / LOCAL'}</small>
      </div>
    </div>
  )
}
