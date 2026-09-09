import { useEffect, useState } from 'react'
import { AudioLines, Check, ChevronDown, Download, FileJson, FolderOpen, Headphones, Layers, Music2, Redo2, Undo2, X } from 'lucide-react'
import { PadGrid } from './components/PadGrid'
import { WaveformEditor } from './components/WaveformEditor'
import { StepSequencer } from './components/StepSequencer'
import { Mixer } from './components/Mixer'
import { Transport } from './components/Transport'
import { EffectRack } from './components/EffectRack'
import { SongTimeline } from './components/SongTimeline'
import { JamPanel } from './components/JamPanel'
import { IconButton } from './components/Controls'
import { reportError, useStudio } from './state/store'
import { padKeys, play, selectTrack, stop, triggerPad } from './state/actions'
import { initializeSession, watchPersistence } from './db/persistence'
import { engine } from './audio/engine'
import { download } from './audio/wav'
import './studio.css'
import './hardware.css'

function Studio({ jamMode, navigate }: { jamMode: boolean; navigate: (path: string) => void }) {
  const state = useStudio()
  const [exporting, setExporting] = useState(false)
  const [exportMenu, setExportMenu] = useState(false)
  useEffect(() => {
    void initializeSession()
    const unwatch = watchPersistence()
    let frame = 0
    const animate = () => {
      const now = performance.now()
      const current = useStudio.getState()
      const flashes = Object.fromEntries(Object.entries(current.flashes).filter(([, until]) => until > now))
      let changed = Object.keys(flashes).length !== Object.keys(current.flashes).length
      let playhead = current.playhead; let sectionId = current.sectionId
      for (const event of engine.consumeEvents()) {
        if (event.padId) flashes[event.padId] = now + 110
        if (event.step !== undefined) { playhead = event.step; sectionId = event.sectionId ?? '' }
        changed = true
        if (event.patternId && current.songMode) useStudio.setState({ patternId: event.patternId })
      }
      if (changed || current.playing !== engine.playing) useStudio.setState({ flashes, playhead: engine.playing ? playhead : -1, sectionId: engine.playing ? sectionId : '', playing: engine.playing })
      frame = requestAnimationFrame(animate)
    }
    animate()
    const keydown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) return
      const current = useStudio.getState()
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); stop(); if (event.shiftKey) current.redo(); else current.undo(); return }
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || !current.ready) return
      if (event.code === 'Space') { event.preventDefault(); if (engine.playing) stop(); else void play(); return }
      const index = padKeys.indexOf(event.key.toLowerCase())
      if (index >= 0) {
        event.preventDefault()
        const track = current.project.tracks.find(item => item.id === current.selectedTrackId)!
        void triggerPad(track, track.pads[index])
      }
    }
    const visibility = () => { if (document.hidden) stop() }
    window.addEventListener('keydown', keydown); document.addEventListener('visibilitychange', visibility)
    return () => { unwatch(); cancelAnimationFrame(frame); window.removeEventListener('keydown', keydown); document.removeEventListener('visibilitychange', visibility); engine.stop() }
  }, [])
  useEffect(() => {
    if (!state.ready) return
    engine.sync(state.project)
    const track = state.project.tracks.find(item => item.id === state.selectedTrackId)
    if (track && !track.pads.some(pad => pad.id === state.selectedPadId)) useStudio.setState({ selectedPadId: track.pads[0].id })
    if (!state.project.patterns.some(pattern => pattern.id === state.patternId)) useStudio.setState({ patternId: state.project.patterns[0].id })
  }, [state.project, state.ready, state.selectedTrackId, state.selectedPadId, state.patternId])
  const exportWav = async () => {
    setExporting(true); setExportMenu(false)
    try { download(await engine.export(state.project), `${state.project.name || 'La La La La'}.wav`) }
    catch (error) { reportError(error) }
    finally { setExporting(false) }
  }
  return <div className="app-shell">
    <header className="app-header"><a className="brand" href="/" onClick={event => { event.preventDefault(); navigate('/') }}><span className="brand-mark"><AudioLines size={23} /></span>La La La La<span className="beta">{jamMode ? 'JAM' : 'STUDIO'}</span></a><nav><a href="/" className={!jamMode ? 'active' : ''} onClick={event => { event.preventDefault(); navigate('/') }}><Layers size={14} />Studio</a><a href="/jam" className={jamMode ? 'active' : ''} onClick={event => { event.preventDefault(); navigate('/jam') }}><Headphones size={14} />Jam</a></nav><div className="header-right"><span className="local-badge"><i />LOCAL SESSION</span><span className="audio-badge">WEB AUDIO</span></div></header>
    <div className="workspace"><aside className="sidebar"><div className="workspace-label">WORKSPACE <FolderOpen size={14} /></div><div className="project-label"><span className="project-art"><Music2 size={23} /></span><strong>{state.project.name}<small>STUDIO PROJECT</small></strong></div><div className="library-heading">SAMPLE TRACKS <span>{String(state.project.tracks.length).padStart(2, '0')}</span></div><div className="track-library">{state.project.tracks.map((track, index) => <button className={state.selectedTrackId === track.id ? 'active' : ''} onClick={() => selectTrack(track)} key={track.id}><AudioLines size={17} /><span>{track.name}<small>{engine.buffers.get(track.sampleBufferId) ? `${engine.buffers.get(track.sampleBufferId)!.duration.toFixed(2)}s / 16 pads` : 'Loading audio'}</small></span><b>{String(index + 1).padStart(2, '0')}</b></button>)}</div><div className="library-heading">PATTERNS <span>{String(state.project.patterns.length).padStart(2, '0')}</span></div><div className="pattern-library">{state.project.patterns.map(pattern => <button key={pattern.id} className={state.patternId === pattern.id ? 'active' : ''} onClick={() => { stop(); useStudio.setState({ patternId: pattern.id }) }}><Layers size={14} />{pattern.name}<span>1 bar</span></button>)}</div><div className="sidebar-footer"><div><span className="local-dot" />ALL SYSTEMS LOCAL</div><span>La La La La / Studio 01</span></div></aside>
    <main><div className="project-toolbar"><div><div className="eyebrow">STUDIO SESSION <span>/</span> UNTITLED COLLECTION</div><input className="project-name" aria-label="Project name" value={state.project.name} maxLength={60} onChange={event => state.edit('Rename project', draft => { draft.name = event.target.value }, 'name')} /><span className="save-status"><Check size={12} />{state.saveStatus}</span></div><div className="project-actions"><IconButton title="Undo" disabled={!state.past.length} onClick={() => { stop(); state.undo() }}><Undo2 size={17} /></IconButton><IconButton title="Redo" disabled={!state.future.length} onClick={() => { stop(); state.redo() }}><Redo2 size={17} /></IconButton><div className="export-container"><button className="export-button" disabled={!state.ready || exporting} onClick={() => setExportMenu(!exportMenu)}><Download size={15} />{exporting ? 'Rendering...' : 'Export'}<ChevronDown size={13} /></button>{exportMenu && <div className="export-menu"><button onClick={() => void exportWav()}><Download size={15} />Render song as WAV</button><button onClick={() => { download(new Blob([JSON.stringify(state.project, null, 2)], { type: 'application/json' }), `${state.project.name}.json`); setExportMenu(false) }}><FileJson size={15} />Export Project JSON</button><small>Audio is not embedded in project JSON.</small></div>}</div></div></div>
    {state.error && <div className="error-banner" role="alert">{state.error}<IconButton title="Dismiss error" onClick={() => useStudio.setState({ error: '' })}><X size={15} /></IconButton></div>}
    {jamMode && state.ready && <JamPanel openStudio={() => navigate('/')} />}
    <Transport />
    <div className="sampler-layout"><PadGrid /><WaveformEditor key={state.project.tracks.find(track => track.id === state.selectedTrackId)?.sampleBufferId} /></div>
    <StepSequencer />
    <div className="bottom-layout"><div className="arrangement-column"><SongTimeline /><EffectRack /></div><Mixer /></div>
    <footer className="studio-footer"><span><i />{state.ready ? 'SESSION READY' : 'LOADING SESSION'}</span><span>CLIENT-SIDE AUDIO <b>/</b> NO CLOUD</span><span>LA LA LA LA v0.1</span></footer>
    </main></div>
  </div>
}

export default function App() {
  const [path, setPath] = useState(window.location.pathname)
  useEffect(() => {
    const popstate = () => { stop(); setPath(window.location.pathname) }
    window.addEventListener('popstate', popstate)
    return () => window.removeEventListener('popstate', popstate)
  }, [])
  const navigate = (next: string) => {
    stop(); window.history.pushState({}, '', next); setPath(next); window.scrollTo(0, 0)
  }
  return <Studio jamMode={path.replace(/\/$/, '') === '/jam'} navigate={navigate} />
}