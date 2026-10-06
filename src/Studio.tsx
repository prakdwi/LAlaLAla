import { useEffect, useRef, useState } from 'react'
import {
  AudioLines,
  Check,
  ChevronDown,
  Copy,
  Download,
  FileJson,
  FolderOpen,
  Headphones,
  Keyboard,
  Layers,
  Mic,
  Music2,
  Package,
  Plus,
  Redo2,
  Trash2,
  Undo2,
  Upload,
  Waves,
  X,
} from 'lucide-react'
import { PadGrid } from './components/PadGrid'
import { WaveformEditor } from './components/WaveformEditor'
import { StepSequencer } from './components/StepSequencer'
import { Mixer } from './components/Mixer'
import { Transport } from './components/Transport'
import { EffectRack } from './components/EffectRack'
import { Timeline } from './components/Timeline'
import { JamPanel } from './components/JamPanel'
import { PianoRoll } from './components/PianoRoll'
import { AudioClipEditor } from './components/AudioClipEditor'
import { AutomationEditor } from './components/AutomationEditor'
import { SynthPanel } from './components/SynthPanel'
import { KeyboardPiano } from './components/KeyboardPiano'
import { IconButton } from './components/Controls'
import { notify, reportError, useStudio, type EditorKind } from './state/store'
import {
  addClip,
  armInput,
  deleteClip,
  noteOff,
  noteOn,
  padKeys,
  play,
  seek,
  selectTrack,
  setLoopRegion,
  stop,
  toggleMetronome,
  toggleRecord,
  triggerPad,
} from './state/actions'
import {
  createProject,
  deleteProject,
  duplicateProject,
  importProject,
  initializeSession,
  openProject,
  watchPersistence,
} from './db/persistence'
import { engine } from './audio/engine'
import { download } from './audio/wav'
import { PIANO_KEYS } from './audio/midi'
import { wavToMp3 } from './export/mp3'
import { exportBundle, readBundle } from './export/bundle'
import { zipSync, strToU8 } from 'fflate'
import type { TrackKind } from './state/types'
import './studio.css'
import './hardware.css'
import './daw.css'

const KIND_ICON: Record<TrackKind, typeof AudioLines> = {
  drums: AudioLines,
  keys: Music2,
  synth: Waves,
  audio: Mic,
  bus: Layers,
}

function Studio({ jamMode, navigate }: { jamMode: boolean; navigate: (path: string) => void }) {
  const state = useStudio()
  const [exporting, setExporting] = useState('')
  const [exportMenu, setExportMenu] = useState(false)
  const [projectMenu, setProjectMenu] = useState(false)
  const importInput = useRef<HTMLInputElement>(null)
  const heldKeys = useRef(new Set<string>())

  useEffect(() => {
    void initializeSession()
    const unwatch = watchPersistence()
    let frame = 0
    const animate = () => {
      const now = performance.now()
      const current = useStudio.getState()
      const flashes = Object.fromEntries(Object.entries(current.flashes).filter(([, until]) => until > now))
      const noteFlashes = Object.fromEntries(Object.entries(current.noteFlashes).filter(([, until]) => until > now))
      let changed =
        Object.keys(flashes).length !== Object.keys(current.flashes).length ||
        Object.keys(noteFlashes).length !== Object.keys(current.noteFlashes).length
      let playhead = current.playhead
      let patternId = current.patternId
      for (const event of engine.consumeEvents()) {
        if (event.padId) flashes[event.padId] = now + 110
        if (event.trackId && event.pitch !== undefined) noteFlashes[`${event.trackId}:${event.pitch}`] = now + 140
        if (event.patternId !== undefined && event.localStep !== undefined) {
          if (
            current.songMode &&
            !current.project.clips.some(
              clip =>
                clip.kind === 'pattern' &&
                clip.patternId === current.patternId &&
                Math.abs(clip.start * 4 - (event.step ?? 0)) < 1e9,
            )
          )
            patternId = event.patternId
          if (event.patternId === patternId) playhead = event.localStep
        }
        changed = true
      }
      const positionBeats = engine.playing ? engine.positionBeats() : -1
      const positionChanged = Math.abs(positionBeats - current.positionBeats) > 0.01
      if (changed || positionChanged || current.playing !== engine.playing) {
        useStudio.setState({
          flashes,
          noteFlashes,
          playhead: engine.playing ? playhead : -1,
          positionBeats: engine.playing ? positionBeats : current.playing ? -1 : current.positionBeats,
          playing: engine.playing,
          patternId,
        })
      }
      frame = requestAnimationFrame(animate)
    }
    animate()

    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return
      const current = useStudio.getState()
      const key = event.key.toLowerCase()
      if ((event.ctrlKey || event.metaKey) && key === 'z') {
        event.preventDefault()
        stop()
        if (event.shiftKey) current.redo()
        else current.undo()
        return
      }
      if (event.ctrlKey || event.metaKey || event.altKey || !current.ready) return
      if (event.key === '?' || (event.shiftKey && event.key === '/')) {
        event.preventDefault()
        useStudio.setState({ showShortcuts: !current.showShortcuts })
        return
      }
      if (event.key === 'Escape') {
        useStudio.setState({ showShortcuts: false, selectedClipId: '' })
        return
      }
      if (event.repeat) return
      if (event.code === 'Space') {
        event.preventDefault()
        if (engine.playing) stop()
        else void play(event.shiftKey ? true : current.songMode)
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        if (engine.playing) stop()
        void play(true)
        return
      }
      if (event.key === 'Home') {
        seek(0)
        return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (current.selectedClipId) deleteClip(current.selectedClipId)
        return
      }
      const track = current.project.tracks.find(item => item.id === current.selectedTrackId)
      if (!track) return
      if (track.kind === 'drums') {
        const index = padKeys.indexOf(key)
        if (index >= 0) {
          event.preventDefault()
          void triggerPad(track, track.pads[index])
          return
        }
      } else if (track.kind === 'keys' || track.kind === 'synth') {
        if (key in PIANO_KEYS) {
          event.preventDefault()
          const pitch = current.keyboardOctave * 12 + 12 + PIANO_KEYS[key]
          heldKeys.current.add(key)
          void noteOn(track, pitch, 0.9)
          return
        }
        if (key === 'z' || key === 'x') {
          useStudio.setState({
            keyboardOctave: Math.max(0, Math.min(7, current.keyboardOctave + (key === 'z' ? -1 : 1))),
          })
          return
        }
      }
      if (key === 'l') setLoopRegion({ enabled: !current.project.loop.enabled })
      else if (key === 'm') toggleMetronome()
      else if (key === 'r') toggleRecord()
      else if (key === '+' || key === '=') useStudio.setState({ zoom: Math.min(160, current.zoom * 1.5) })
      else if (key === '-') useStudio.setState({ zoom: Math.max(6, current.zoom / 1.5) })
    }
    const keyup = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (!heldKeys.current.has(key)) return
      heldKeys.current.delete(key)
      const current = useStudio.getState()
      const track = current.project.tracks.find(item => item.id === current.selectedTrackId)
      if (track) noteOff(track, current.keyboardOctave * 12 + 12 + PIANO_KEYS[key])
    }
    const blur = () => {
      heldKeys.current.clear()
      engine.releaseAll()
    }
    window.addEventListener('keydown', keydown)
    window.addEventListener('keyup', keyup)
    window.addEventListener('blur', blur)
    return () => {
      unwatch()
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', keydown)
      window.removeEventListener('keyup', keyup)
      window.removeEventListener('blur', blur)
      engine.stop()
    }
  }, [])

  useEffect(() => {
    if (!state.ready) return
    engine.sync(state.project)
    const track = state.project.tracks.find(item => item.id === state.selectedTrackId)
    if (!track) selectTrack(state.project.tracks[0])
    else if (track.pads.length && !track.pads.some(pad => pad.id === state.selectedPadId))
      useStudio.setState({ selectedPadId: track.pads[0].id })
    if (!state.project.patterns.some(pattern => pattern.id === state.patternId))
      useStudio.setState({ patternId: state.project.patterns[0].id })
    if (state.selectedClipId && !state.project.clips.some(clip => clip.id === state.selectedClipId))
      useStudio.setState({ selectedClipId: '' })
    if (!state.project.lanes.some(lane => lane.id === state.selectedLaneId))
      useStudio.setState({ selectedLaneId: state.project.lanes[0].id })
  }, [
    state.project,
    state.ready,
    state.selectedTrackId,
    state.selectedPadId,
    state.patternId,
    state.selectedClipId,
    state.selectedLaneId,
  ])

  const runExport = async (label: string, job: () => Promise<void>) => {
    setExporting(label)
    setExportMenu(false)
    try {
      await job()
    } catch (error) {
      reportError(error)
    } finally {
      setExporting('')
    }
  }
  const name = state.project.name || 'La La La La'
  const exportWav = () =>
    runExport('Rendering WAV', async () => download(await engine.render(state.project), `${name}.wav`))
  const exportMp3 = () =>
    runExport('Encoding MP3', async () => {
      const wav = await engine.render(state.project)
      download(
        await wavToMp3(wav, 192, fraction => setExporting(`Encoding MP3 ${Math.round(fraction * 100)}%`)),
        `${name}.mp3`,
      )
    })
  const exportStems = () =>
    runExport('Rendering stems', async () => {
      const stems = await engine.renderStems(state.project, (done, total) =>
        setExporting(`Rendering stems ${done}/${total}`),
      )
      const files: Record<string, Uint8Array> = {}
      for (const stem of stems)
        files[`${stem.name.replace(/[^\w\- ]+/g, '_')}.wav`] = new Uint8Array(await stem.blob.arrayBuffer())
      files['README.txt'] = strToU8(`Stems rendered from "${name}" at ${state.project.bpm} BPM.`)
      download(new Blob([zipSync(files, { level: 0 }) as BlobPart], { type: 'application/zip' }), `${name} stems.zip`)
    })
  const exportBundleZip = () =>
    runExport('Packing project', async () =>
      download(await exportBundle(state.project, engine.blobs), `${name}.lalala.zip`),
    )
  const exportJson = () => {
    download(new Blob([JSON.stringify(state.project, null, 2)], { type: 'application/json' }), `${name}.json`)
    setExportMenu(false)
  }
  const importFile = async (file?: File) => {
    if (!file) return
    try {
      if (file.name.endsWith('.zip')) {
        const bundle = await readBundle(file)
        await importProject(bundle.json, bundle.audio)
      } else await importProject(await file.text())
    } catch (error) {
      reportError(error instanceof SyntaxError ? 'That file is not valid project JSON.' : error)
    } finally {
      if (importInput.current) importInput.current.value = ''
    }
  }

  const track = state.project.tracks.find(item => item.id === state.selectedTrackId) ?? state.project.tracks[0]
  const clip = state.project.clips.find(item => item.id === state.selectedClipId)
  const editor: EditorKind =
    state.editor !== 'auto'
      ? state.editor
      : clip?.kind === 'midi'
        ? 'piano'
        : clip?.kind === 'audio'
          ? 'audio'
          : clip?.kind === 'automation'
            ? 'automation'
            : 'sequencer'
  const editors: { id: EditorKind; label: string; available: boolean }[] = [
    { id: 'sequencer', label: 'Step sequencer', available: true },
    { id: 'piano', label: 'Piano roll', available: clip?.kind === 'midi' },
    { id: 'audio', label: 'Audio clip', available: clip?.kind === 'audio' },
    { id: 'automation', label: 'Automation', available: clip?.kind === 'automation' },
  ]

  return (
    <div className="app-shell">
      <header className="app-header">
        <a
          className="brand"
          href="/"
          onClick={event => {
            event.preventDefault()
            navigate('/')
          }}
        >
          <span className="brand-mark">
            <AudioLines size={23} />
          </span>
          La La La La<span className="beta">{jamMode ? 'JAM' : 'STUDIO'}</span>
        </a>
        <nav>
          <a
            href="/"
            className={!jamMode ? 'active' : ''}
            onClick={event => {
              event.preventDefault()
              navigate('/')
            }}
          >
            <Layers size={14} />
            Studio
          </a>
          <a
            href="/jam"
            className={jamMode ? 'active' : ''}
            onClick={event => {
              event.preventDefault()
              navigate('/jam')
            }}
          >
            <Headphones size={14} />
            Jam
          </a>
        </nav>
        <div className="header-right">
          <button
            className="shortcut-button"
            onClick={() => useStudio.setState({ showShortcuts: true })}
            title="Keyboard shortcuts (?)"
          >
            <Keyboard size={13} />
            Keys
          </button>
          <span className="local-badge">
            <i />
            LOCAL SESSION
          </span>
          <span className="audio-badge">WEB AUDIO</span>
        </div>
      </header>
      <div className="workspace">
        <aside className="sidebar">
          <div className="workspace-label">
            WORKSPACE
            <div className="export-container">
              <IconButton title="Project actions" onClick={() => setProjectMenu(!projectMenu)}>
                <FolderOpen size={14} />
              </IconButton>
              {projectMenu && (
                <div className="export-menu project-menu" role="menu">
                  <button
                    role="menuitem"
                    onClick={() => {
                      setProjectMenu(false)
                      void createProject()
                    }}
                  >
                    <Plus size={14} />
                    New project
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setProjectMenu(false)
                      void duplicateProject()
                    }}
                  >
                    <Copy size={14} />
                    Duplicate project
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setProjectMenu(false)
                      importInput.current?.click()
                    }}
                  >
                    <Upload size={14} />
                    Import JSON / ZIP
                  </button>
                  <button
                    role="menuitem"
                    disabled={state.projects.length <= 1 && false}
                    onClick={() => {
                      setProjectMenu(false)
                      if (confirm(`Delete "${state.project.name}"? This cannot be undone.`))
                        void deleteProject(state.project.id)
                    }}
                  >
                    <Trash2 size={14} />
                    Delete project
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="project-label">
            <span className="project-art">
              <Music2 size={23} />
            </span>
            <strong>
              {state.project.name}
              <small>STUDIO PROJECT</small>
            </strong>
          </div>
          {state.projects.length > 1 && (
            <>
              <div className="library-heading">
                PROJECTS <span>{String(state.projects.length).padStart(2, '0')}</span>
              </div>
              <div className="project-library">
                {state.projects.map(item => (
                  <button
                    key={item.id}
                    className={item.id === state.project.id ? 'active' : ''}
                    onClick={() => item.id !== state.project.id && void openProject(item.id)}
                  >
                    <span>
                      {item.name}
                      <small>
                        {item.bpm} BPM / {item.trackCount} tracks
                      </small>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="library-heading">
            TRACKS <span>{String(state.project.tracks.length).padStart(2, '0')}</span>
          </div>
          <div className="track-library">
            {state.project.tracks.map((item, index) => {
              const Icon = KIND_ICON[item.kind]
              const buffer = engine.buffers.get(item.sampleBufferId)
              return (
                <button
                  className={state.selectedTrackId === item.id ? 'active' : ''}
                  onClick={() => selectTrack(item)}
                  key={item.id}
                  style={{ '--track-color': item.color } as React.CSSProperties}
                >
                  <Icon size={17} />
                  <span>
                    {item.name}
                    <small>
                      {item.kind === 'drums'
                        ? buffer
                          ? `${buffer.duration.toFixed(2)}s / 16 pads`
                          : 'Loading audio'
                        : item.kind === 'keys'
                          ? buffer
                            ? `${buffer.duration.toFixed(2)}s sample`
                            : 'Loading audio'
                          : item.kind.toUpperCase()}
                    </small>
                  </span>
                  <b>{String(index + 1).padStart(2, '0')}</b>
                </button>
              )
            })}
          </div>
          <div className="library-heading">
            PATTERNS <span>{String(state.project.patterns.length).padStart(2, '0')}</span>
          </div>
          <div className="pattern-library">
            {state.project.patterns.map(pattern => (
              <button
                key={pattern.id}
                className={state.patternId === pattern.id ? 'active' : ''}
                onClick={() => {
                  if (state.songMode) stop()
                  useStudio.setState({ patternId: pattern.id, editor: 'auto', selectedClipId: '' })
                }}
                onDoubleClick={() =>
                  addClip('pattern', state.selectedLaneId, Math.max(0, state.positionBeats), { patternId: pattern.id })
                }
                title="Double-click to add to the arrangement at the playhead"
              >
                <Layers size={14} />
                {pattern.name}
                <span>
                  {pattern.bars} bar{pattern.bars > 1 ? 's' : ''}
                </span>
              </button>
            ))}
          </div>
          <div className="sidebar-footer">
            <div>
              <span className="local-dot" />
              ALL SYSTEMS LOCAL
            </div>
            <span>La La La La / Studio 02</span>
          </div>
        </aside>
        <main>
          <div className="project-toolbar">
            <div>
              <div className="eyebrow">
                STUDIO SESSION <span>/</span> {state.projects.length} PROJECT{state.projects.length === 1 ? '' : 'S'}{' '}
                SAVED
              </div>
              <input
                className="project-name"
                aria-label="Project name"
                value={state.project.name}
                maxLength={60}
                onChange={event =>
                  state.edit(
                    'Rename project',
                    draft => {
                      draft.name = event.target.value
                    },
                    'name',
                  )
                }
              />
              <span className="save-status">
                <Check size={12} />
                {state.saveStatus}
              </span>
            </div>
            <div className="project-actions">
              <IconButton
                title="Undo"
                disabled={!state.past.length}
                onClick={() => {
                  state.undo()
                }}
              >
                <Undo2 size={17} />
              </IconButton>
              <IconButton
                title="Redo"
                disabled={!state.future.length}
                onClick={() => {
                  state.redo()
                }}
              >
                <Redo2 size={17} />
              </IconButton>
              <input
                ref={importInput}
                type="file"
                accept=".json,.zip,application/json,application/zip"
                hidden
                aria-label="Import project file"
                onChange={event => void importFile(event.target.files?.[0])}
              />
              <button className="import-button" disabled={!state.ready} onClick={() => importInput.current?.click()}>
                <Upload size={15} />
                Import
              </button>
              <div className="export-container">
                <button
                  className="export-button"
                  disabled={!state.ready || Boolean(exporting)}
                  onClick={() => setExportMenu(!exportMenu)}
                >
                  <Download size={15} />
                  {exporting || 'Export'}
                  <ChevronDown size={13} />
                </button>
                {exportMenu && (
                  <div className="export-menu" role="menu">
                    <button role="menuitem" onClick={() => void exportWav()}>
                      <Download size={15} />
                      Render song as WAV
                    </button>
                    <button role="menuitem" onClick={() => void exportMp3()}>
                      <Download size={15} />
                      Render song as MP3
                    </button>
                    <button role="menuitem" onClick={() => void exportStems()}>
                      <Layers size={15} />
                      Export stems (ZIP of WAVs)
                    </button>
                    <button role="menuitem" onClick={() => void exportBundleZip()}>
                      <Package size={15} />
                      Export project bundle (ZIP with audio)
                    </button>
                    <button role="menuitem" onClick={exportJson}>
                      <FileJson size={15} />
                      Export project JSON
                    </button>
                    <small>JSON holds settings only; the bundle includes your samples and recordings.</small>
                  </div>
                )}
              </div>
            </div>
          </div>
          {state.error && (
            <div className="error-banner" role="alert">
              {state.error}
              <IconButton title="Dismiss error" onClick={() => useStudio.setState({ error: '' })}>
                <X size={15} />
              </IconButton>
            </div>
          )}
          {state.notice && (
            <div className="notice-toast" role="status">
              {state.notice}
            </div>
          )}
          {jamMode && state.ready && <JamPanel openStudio={() => navigate('/')} />}
          <Transport />
          <Timeline />
          <div className="editor-tabs" role="tablist">
            {editors
              .filter(item => item.available)
              .map(item => (
                <button
                  key={item.id}
                  role="tab"
                  aria-selected={editor === item.id}
                  className={editor === item.id ? 'selected' : ''}
                  onClick={() => useStudio.setState({ editor: item.id })}
                >
                  {item.label}
                </button>
              ))}
            {clip?.kind === 'pattern' && <span className="eyebrow">Editing pattern clip "{clip.name}"</span>}
            {!clip && track.kind !== 'drums' && track.kind !== 'bus' && (
              <button
                className="add-clip"
                onClick={() =>
                  addClip(
                    track.kind === 'audio' ? 'pattern' : 'midi',
                    state.selectedLaneId,
                    Math.max(0, state.positionBeats),
                    { trackId: track.id },
                  )
                }
                disabled={track.kind === 'audio'}
              >
                <Plus size={13} />
                {track.kind === 'audio' ? 'Arm input and record to add audio' : `New MIDI clip for ${track.name}`}
              </button>
            )}
          </div>
          {editor === 'piano' && clip?.kind === 'midi' ? (
            <PianoRoll clip={clip} />
          ) : editor === 'audio' && clip?.kind === 'audio' ? (
            <AudioClipEditor clip={clip} />
          ) : editor === 'automation' && clip?.kind === 'automation' ? (
            <AutomationEditor clip={clip} />
          ) : (
            <StepSequencer />
          )}
          <div className="sampler-layout">
            {track.kind === 'drums' && <PadGrid />}
            {(track.kind === 'keys' || track.kind === 'synth') && <KeyboardPiano track={track} />}
            {track.kind === 'audio' && (
              <section className="pads-section audio-track-panel" aria-label="Audio track">
                <div className="section-heading">
                  <h2>
                    <Mic size={15} />
                    Audio track
                  </h2>
                  <span className="tag">{state.inputArmed ? 'ARMED' : 'IDLE'}</span>
                </div>
                <div className="audio-track-body">
                  <p>
                    Arm the input, press record, then play. A count-in runs if one is set. Recording stops with the
                    transport and lands as a clip on this track.
                  </p>
                  <div className="inline-actions">
                    <button
                      className={`toggle ${state.inputArmed ? 'on armed' : ''}`}
                      onClick={() => void armInput(!state.inputArmed)}
                    >
                      <Mic size={13} />
                      {state.inputArmed ? 'Disarm input' : 'Arm microphone'}
                    </button>
                    {state.inputDevices.length > 1 && (
                      <select
                        aria-label="Input device"
                        value={state.inputDeviceId}
                        onChange={event => {
                          useStudio.setState({ inputDeviceId: event.target.value })
                          if (state.inputArmed) void armInput(true)
                        }}
                      >
                        {state.inputDevices.map(device => (
                          <option key={device.id} value={device.id}>
                            {device.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <small>
                    Clips on this track:{' '}
                    {state.project.clips.filter(item => item.kind === 'audio' && item.trackId === track.id).length}
                  </small>
                </div>
              </section>
            )}
            {track.kind === 'bus' && (
              <section className="pads-section audio-track-panel" aria-label="Bus track">
                <div className="section-heading">
                  <h2>
                    <Layers size={15} />
                    Bus
                  </h2>
                  <span className="tag">GROUP / SEND</span>
                </div>
                <div className="audio-track-body">
                  <p>
                    Other tracks can route their output here or send a copy of their signal. Put shared reverb, delay,
                    or group compression in this bus's effect rack.
                  </p>
                  <small>
                    Feeding tracks:{' '}
                    {state.project.tracks
                      .filter(
                        item =>
                          item.outputBusId === track.id ||
                          item.sends.some(send => send.busId === track.id && send.level > 0),
                      )
                      .map(item => item.name)
                      .join(', ') || 'none yet'}
                  </small>
                </div>
              </section>
            )}
            {track.kind === 'synth' ? (
              <SynthPanel track={track} />
            ) : track.kind === 'drums' || track.kind === 'keys' ? (
              <WaveformEditor key={track.sampleBufferId + track.id} />
            ) : (
              <EffectRack />
            )}
          </div>
          <div className="bottom-layout">
            <div className="arrangement-column">
              {track.kind === 'audio' || track.kind === 'bus' ? <Mixer /> : <EffectRack />}
            </div>
            {track.kind !== 'audio' && track.kind !== 'bus' && <Mixer />}
          </div>
          <footer className="studio-footer">
            <span>
              <i />
              {state.ready ? 'SESSION READY' : 'LOADING SESSION'}
            </span>
            <span>
              CLIENT-SIDE AUDIO <b>/</b> NO CLOUD
            </span>
            <span>LA LA LA LA v0.2</span>
          </footer>
        </main>
      </div>
      {state.showShortcuts && <Shortcuts onClose={() => useStudio.setState({ showShortcuts: false })} />}
    </div>
  )
}

function Shortcuts({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ['Space', 'Play / stop (Shift+Space plays the song)'],
    ['Enter', 'Play song from the playhead'],
    ['R', 'Toggle record (count-in applies)'],
    ['L / M', 'Toggle loop region / metronome'],
    ['Home', 'Playhead to start'],
    ['1-4 Q-R A-F Z-V', 'Drum pads on the selected drum track'],
    ['A S D F G H J K L', 'White keys on keys / synth tracks'],
    ['W E T Y U O P', 'Black keys; Z / X shift octave'],
    ['Delete', 'Delete selected clip or note'],
    ['Ctrl/Cmd+Z, Shift+Z', 'Undo / redo'],
    ['+ / -', 'Zoom timeline'],
    ['Shift+drag ruler', 'Set loop region'],
    ['Double-click lane', 'Add the current pattern as a clip'],
    ['?', 'This panel'],
  ]
  return (
    <div className="shortcuts-overlay" role="dialog" aria-label="Keyboard shortcuts" onClick={onClose}>
      <div className="shortcuts-panel" onClick={event => event.stopPropagation()}>
        <div className="section-heading">
          <h2>
            <Keyboard size={15} />
            Keyboard shortcuts
          </h2>
          <IconButton title="Close shortcuts" onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>
        <dl>
          {rows.map(([keys, action]) => (
            <div key={keys}>
              <dt>
                <kbd>{keys}</kbd>
              </dt>
              <dd>{action}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}

export default function App() {
  const [path, setPath] = useState(window.location.pathname)
  useEffect(() => {
    const popstate = () => {
      stop()
      setPath(window.location.pathname)
    }
    window.addEventListener('popstate', popstate)
    return () => window.removeEventListener('popstate', popstate)
  }, [])
  const navigate = (next: string) => {
    stop()
    window.history.pushState({}, '', next)
    setPath(next)
    window.scrollTo(0, 0)
  }
  useEffect(() => {
    if (jamFirstVisit) {
      jamFirstVisit = false
      notify('Tip: press ? for keyboard shortcuts.')
    }
  }, [])
  return <Studio jamMode={path.replace(/\/$/, '') === '/jam'} navigate={navigate} />
}
let jamFirstVisit = true
