import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Circle,
  Copy,
  Disc3,
  Eraser,
  ExternalLink,
  Link,
  Mic,
  Plus,
  Repeat,
  Scissors,
  Square,
  Trash2,
  Undo2,
  VolumeX,
} from 'lucide-react'
import { useStudio, reportError } from '../state/store'
import { addJamToSong, createJamPattern, parseYouTubeUrl } from '../state/jam'
import { play, selectTrack, setPatternBars, stop, toggleMetronome } from '../state/actions'
import {
  chop,
  clearPattern,
  clearTrack,
  duplicateTrack,
  resamplePattern,
  setMpc,
  splitPadAtMarker,
  startSampling,
  stopSampling,
  tapTempo,
  type LevelsMode,
  type QuantizeGrid,
  type RepeatRate,
} from '../state/mpc'
import { addPadBank, BANK_NAMES, bankCount } from '../state/sampling'
import { stepsPerBar } from '../state/defaults'
import { engine } from '../audio/engine'
import { PadGrid } from './PadGrid'
import { WaveformEditor } from './WaveformEditor'
import { IconButton } from './Controls'

const REPEATS: [RepeatRate, string][] = [
  [0, 'Off'],
  [1, '1/4'],
  [0.5, '1/8'],
  [0.25, '1/16'],
  [0.125, '1/32'],
]
const QUANTIZE: [QuantizeGrid, string][] = [
  [1, '1/4'],
  [0.5, '1/8'],
  [0.25, '1/16'],
  [0, 'Off'],
]

function Toggle({
  on,
  onClick,
  title,
  children,
  disabled,
}: {
  on: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
  disabled?: boolean
}) {
  return (
    <button
      className={`toggle ${on ? 'on' : ''}`}
      aria-pressed={on}
      onClick={onClick}
      title={title}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

export function JamPanel({ openStudio }: { openStudio: () => void }) {
  const { project, ready, edit, recording, playing, patternId, selectedTrackId, selectedPadId, mpc, past, undo } =
    useStudio()
  const [url, setUrl] = useState(project.jamSource ? `https://youtu.be/${project.jamSource.videoId}` : '')
  const [name, setName] = useState('Jam take')
  const [repeats, setRepeats] = useState(2)
  const [message, setMessage] = useState('')
  const [urlError, setUrlError] = useState('')
  const [starting, setStarting] = useState(false)
  const [sampleToNew, setSampleToNew] = useState(false)
  const [tapped, setTapped] = useState<number | null>(null)
  const generation = useRef({ version: 0 })
  useEffect(() => {
    const session = generation.current
    const state = useStudio.getState()
    if (state.project.patterns.some(item => item.id === state.project.jamPatternId))
      useStudio.setState({ patternId: state.project.jamPatternId })
    return () => {
      session.version++
    }
  }, [])
  const source = project.jamSource
  const pattern = project.patterns.find(item => item.id === patternId)
  const track = project.tracks.find(item => item.id === selectedTrackId) ?? project.tracks[0]
  const pad = track.pads.find(item => item.id === selectedPadId) ?? track.pads[0]
  const buffer = engine.buffers.get(track.sampleBufferId)
  const padTracks = project.tracks.filter(item => item.kind === 'drums' || item.kind === 'keys')
  const noteCount = pattern?.trackSteps.reduce((sum, row) => sum + row.steps.filter(step => step.active).length, 0) ?? 0
  const trackNotes =
    pattern?.trackSteps.find(row => row.trackId === track.id)?.steps.filter(step => step.active).length ?? 0
  const banks = bankCount(track)
  const newTake = () => {
    stop()
    setMessage('')
    let id = ''
    edit('New Jam take', draft => {
      id = createJamPattern(draft)
      draft.jamPatternId = id
    })
    useStudio.setState({ patternId: id })
    return id
  }
  const recordTake = async () => {
    if (starting) return
    setStarting(true)
    const token = ++generation.current.version
    if (project.jamPatternId !== patternId) newTake()
    await play(false, { countIn: true })
    if (generation.current.version === token && useStudio.getState().playing) useStudio.setState({ recording: true })
    setStarting(false)
  }
  const stopTake = () => {
    generation.current.version++
    stop()
    setStarting(false)
  }
  return (
    <section className="jam-workspace mpc" aria-label="YouTube Jam workspace">
      <div className="jam-heading">
        <div>
          <span className="eyebrow">YOUTUBE / LOCAL PADS</span>
          <h1>Jam room</h1>
        </div>
        <div className="inline-actions">
          <label>
            Kit
            <select
              aria-label="Jam track"
              value={track.id}
              onChange={event => {
                const next = project.tracks.find(item => item.id === event.target.value)
                if (next) selectTrack(next)
              }}
            >
              {project.tracks.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.kind === 'drums' ? '' : ` (${item.kind})`}
                </option>
              ))}
            </select>
          </label>
          <IconButton title="Duplicate kit" onClick={() => duplicateTrack(track.id)}>
            <Copy size={14} />
          </IconButton>
          <span className="tag">MPC MODE</span>
        </div>
      </div>
      <form
        className="youtube-form"
        onSubmit={event => {
          event.preventDefault()
          const parsed = parseYouTubeUrl(url)
          if (!parsed) {
            setUrlError('Enter a valid YouTube video URL (watch, share, Shorts, or live).')
            return
          }
          setUrlError('')
          setMessage('')
          edit('YouTube backing video', draft => {
            draft.jamSource = parsed
          })
        }}
      >
        <Link size={16} />
        <input
          aria-label="YouTube video URL"
          placeholder="Paste a YouTube video URL"
          value={url}
          onChange={event => setUrl(event.target.value)}
        />
        <button disabled={!ready || !url.trim()} type="submit">
          Load video
        </button>
      </form>
      {urlError && (
        <p className="jam-validation" role="alert">
          {urlError}
        </p>
      )}

      <div className="mpc-modes" role="toolbar" aria-label="Pad modes">
        <div className="mode-group" aria-label="Pad bank">
          {Array.from({ length: banks }, (_, index) => (
            <button
              key={index}
              className={`toggle ${mpc.bank === index ? 'on' : ''}`}
              aria-pressed={mpc.bank === index}
              onClick={() => setMpc({ bank: index })}
              aria-label={`Bank ${BANK_NAMES[index]}`}
            >
              {BANK_NAMES[index]}
            </button>
          ))}
          {banks < 4 && (
            <IconButton
              title="Add pad bank"
              onClick={() =>
                edit('Add pad bank', draft => {
                  const target = draft.tracks.find(item => item.id === track.id)
                  if (target) addPadBank(target, buffer?.duration ?? 1)
                })
              }
            >
              <Plus size={13} />
            </IconButton>
          )}
        </div>
        <div className="mode-group">
          <Toggle
            on={mpc.fullLevel}
            onClick={() => setMpc({ fullLevel: !mpc.fullLevel })}
            title="Every hit at full velocity"
          >
            Full level
          </Toggle>
          <label className="mode-select">
            16 levels
            <select
              aria-label="16 levels mode"
              value={mpc.levels}
              onChange={event => setMpc({ levels: event.target.value as LevelsMode })}
            >
              <option value="off">Off</option>
              <option value="velocity">Velocity</option>
              <option value="tune">Tune</option>
            </select>
          </label>
          <label className="mode-select">
            <Repeat size={12} /> Repeat
            <select
              aria-label="Note repeat rate"
              value={mpc.repeat}
              onChange={event => setMpc({ repeat: Number(event.target.value) as RepeatRate })}
            >
              {REPEATS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="mode-select">
            Quantize
            <select
              aria-label="Record quantize"
              value={mpc.quantize}
              onChange={event => setMpc({ quantize: Number(event.target.value) as QuantizeGrid })}
            >
              {QUANTIZE.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <Toggle
            on={mpc.erase}
            onClick={() => setMpc({ erase: !mpc.erase, padMute: false })}
            title="Erase: tap a pad to remove its steps from the take"
          >
            <Eraser size={12} />
            Erase
          </Toggle>
          <Toggle
            on={mpc.padMute}
            onClick={() => setMpc({ padMute: !mpc.padMute, erase: false })}
            title="Pad mute: tap a pad to mute it in playback"
          >
            <VolumeX size={12} />
            Pad mute
          </Toggle>
        </div>
        <div className="mode-group">
          <button onClick={() => setTapped(tapTempo())} title="Tap tempo" aria-label="Tap tempo">
            Tap {tapped ? `${tapped}` : project.bpm}
          </button>
          <label className="mode-select">
            Bars
            <select
              aria-label="Take length in bars"
              value={pattern?.bars ?? 1}
              onChange={event => pattern && setPatternBars(pattern.id, Number(event.target.value))}
            >
              {[1, 2, 4, 8].map(bars => (
                <option key={bars} value={bars}>
                  {bars}
                </option>
              ))}
            </select>
          </label>
          <Toggle on={project.metronome} onClick={toggleMetronome} title="Metronome">
            Click
          </Toggle>
          <label className="mode-select">
            Count-in
            <select
              aria-label="Jam count-in bars"
              value={project.countInBars}
              onChange={event =>
                edit('Count-in', draft => {
                  draft.countInBars = Number(event.target.value)
                })
              }
            >
              {[0, 1, 2].map(bars => (
                <option key={bars} value={bars}>
                  {bars}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mode-group">
          <Toggle
            on={mpc.sampling}
            onClick={() => (mpc.sampling ? void stopSampling(track, sampleToNew) : void startSampling())}
            title="Record a sample from the microphone into this kit"
            disabled={!ready}
          >
            <Mic size={12} />
            {mpc.sampling ? 'Stop sampling' : 'Sample'}
          </Toggle>
          <label className="check-label">
            <input type="checkbox" checked={sampleToNew} onChange={event => setSampleToNew(event.target.checked)} />
            to new kit
          </label>
          <button
            onClick={() => void resamplePattern()}
            title="Render this take to a sample on a new kit"
            disabled={!ready || !noteCount}
          >
            <Disc3 size={12} />
            Resample
          </button>
        </div>
      </div>

      <div className="mpc-layout">
        <div className="mpc-left">
          <div className="youtube-player">
            {source ? (
              <iframe
                key={`${source.videoId}-${source.start}`}
                title="YouTube backing video"
                src={`https://www.youtube-nocookie.com/embed/${source.videoId}?start=${source.start}&playsinline=1&rel=0`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            ) : (
              <div className="youtube-empty">
                <Link size={30} />
                <span>No backing video</span>
              </div>
            )}
            {source && (
              <div className="video-actions">
                <a
                  href={`https://www.youtube.com/watch?v=${source.videoId}&t=${source.start}s`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={12} />
                  Open on YouTube
                </a>
                <button
                  onClick={() =>
                    edit('Remove backing video', draft => {
                      delete draft.jamSource
                    })
                  }
                >
                  Remove video
                </button>
              </div>
            )}
          </div>
          <div className="jam-take">
            <div className="section-heading">
              <h2>Pad performance</h2>
              <span>{noteCount} NOTES</span>
            </div>
            <div className="take-content">
              <strong className="take-pattern">{pattern?.name ?? 'No take'}</strong>
              <div className="take-buttons">
                <button
                  disabled={!ready || starting || recording}
                  onClick={() => void recordTake()}
                  aria-pressed={recording}
                >
                  <Circle size={14} fill={recording ? 'currentColor' : 'none'} />
                  {recording ? 'Recording' : 'Record take'}
                </button>
                <button aria-label="Stop Jam recording" disabled={!playing && !starting} onClick={stopTake}>
                  <Square size={14} />
                </button>
                <button disabled={!ready || starting} onClick={newTake}>
                  <Plus size={14} />
                  New take
                </button>
                <IconButton title="Undo last hit" disabled={!past.length} onClick={undo}>
                  <Undo2 size={14} />
                </IconButton>
              </div>
              <div className="take-buttons secondary">
                <button
                  disabled={!trackNotes}
                  onClick={() => clearTrack(track)}
                  title="Remove this kit's steps from the take"
                >
                  <Trash2 size={12} />
                  Clear {track.name}
                </button>
                <button disabled={!noteCount} onClick={clearPattern} title="Remove every step from the take">
                  <Trash2 size={12} />
                  Clear take
                </button>
              </div>
              <label>
                Section name
                <input
                  aria-label="Jam section name"
                  value={name}
                  maxLength={32}
                  onChange={event => setName(event.target.value)}
                />
              </label>
              <label>
                Repeats
                <input
                  aria-label="Jam repeat count"
                  type="number"
                  min={1}
                  max={32}
                  value={repeats}
                  onChange={event => setRepeats(Math.max(1, Math.min(32, Number(event.target.value) || 1)))}
                />
              </label>
              <button
                className="add-jam-button"
                disabled={!ready || !noteCount || recording || starting}
                onClick={() => {
                  stopTake()
                  try {
                    edit('Add Jam take to song', draft => {
                      addJamToSong(draft, patternId, name, repeats)
                    })
                    setMessage(`Added "${name.trim() || pattern?.name}" to the song (${repeats}x).`)
                  } catch (error) {
                    reportError(error)
                  }
                }}
              >
                <Plus size={15} />
                Add to song
              </button>
              {message && (
                <div className="jam-success" role="status">
                  {message}
                  <button onClick={openStudio}>
                    Open song in Studio
                    <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="mpc-center">
          {padTracks.length > 0 && (track.kind === 'drums' || track.kind === 'keys') ? (
            <PadGrid />
          ) : (
            <div className="youtube-empty tall">
              <span>Select a drum or keys kit to use the pads.</span>
            </div>
          )}
          <div className="section-foot">
            <span>
              {stepsPerBar(project) * (pattern?.bars ?? 1)} STEPS <b>/</b> {pattern?.bars ?? 1} BAR
              {(pattern?.bars ?? 1) > 1 ? 'S' : ''}
            </span>
            <span>Hit low on a pad for full velocity, high for soft. Hold a pad with Repeat on for rolls.</span>
          </div>
        </div>
        <div className="mpc-right">
          <div className="chop-bar">
            <span className="eyebrow">
              <Scissors size={12} /> CHOP
            </span>
            <select
              aria-label="Chop mode"
              value={mpc.chopMode}
              onChange={event => setMpc({ chopMode: event.target.value as 'auto' | 'equal' })}
            >
              <option value="auto">Threshold</option>
              <option value="equal">Equal regions</option>
            </select>
            {mpc.chopMode === 'auto' ? (
              <label>
                Sensitivity
                <input
                  aria-label="Chop sensitivity"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={mpc.chopSensitivity}
                  onChange={event => setMpc({ chopSensitivity: Number(event.target.value) })}
                />
              </label>
            ) : (
              <label>
                Regions
                <select
                  aria-label="Chop region count"
                  value={mpc.chopCount}
                  onChange={event => setMpc({ chopCount: Number(event.target.value) })}
                >
                  {[4, 8, 16, 32].map(count => (
                    <option key={count} value={count}>
                      {count}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              disabled={!buffer}
              onClick={() => {
                const count = chop(track, mpc.chopMode, { sensitivity: mpc.chopSensitivity, count: mpc.chopCount })
                if (count) setMessage('')
              }}
            >
              Chop
            </button>
            <button
              disabled={!buffer || !pad}
              onClick={() => pad && splitPadAtMarker(track, pad)}
              title="Make this pad's IN point a new slice"
            >
              Slice here
            </button>
          </div>
          {(track.kind === 'drums' || track.kind === 'keys') && (
            <WaveformEditor key={track.sampleBufferId + track.id} />
          )}
        </div>
      </div>
      <p className="youtube-limit">
        YouTube audio is playback-only, is not sampled, and is excluded from WAV exports. Video playback is independent
        of the pad clock. Recorded pad notes and your local samples are included in the song. Use{' '}
        <strong>Sample</strong> to record your microphone into a kit.
      </p>
    </section>
  )
}
