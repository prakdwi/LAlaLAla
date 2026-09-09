import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Circle, ExternalLink, Link, Plus, Square } from 'lucide-react'
import { useStudio, reportError } from '../state/store'
import { addJamToSong, createJamPattern, parseYouTubeUrl } from '../state/jam'
import { play, stop } from '../state/actions'

export function JamPanel({ openStudio }: { openStudio: () => void }) {
  const { project, ready, edit, recording, playing, patternId } = useStudio()
  const [url, setUrl] = useState(project.jamSource ? `https://youtu.be/${project.jamSource.videoId}` : '')
  const [name, setName] = useState('Jam take')
  const [repeats, setRepeats] = useState(2)
  const [message, setMessage] = useState('')
  const [urlError, setUrlError] = useState('')
  const [starting, setStarting] = useState(false)
  const generation = useRef({ version: 0 })
  useEffect(() => {
    const session = generation.current
    const state = useStudio.getState()
    if (state.project.patterns.some(item => item.id === state.project.jamPatternId)) useStudio.setState({ patternId: state.project.jamPatternId })
    return () => { session.version++ }
  }, [])
  const source = project.jamSource
  const pattern = project.patterns.find(item => item.id === patternId)
  const noteCount = pattern?.trackSteps.reduce((sum, row) => sum + row.steps.filter(step => step.active).length, 0) ?? 0
  const newTake = () => {
    stop(); setMessage('')
    let id = ''
    edit('New Jam take', draft => { id = createJamPattern(draft); draft.jamPatternId = id })
    useStudio.setState({ patternId: id })
    return id
  }
  const recordTake = async () => {
    if (starting) return
    setStarting(true)
    const token = ++generation.current.version
    if (project.jamPatternId !== patternId) newTake()
    await play(false)
    if (generation.current.version === token && useStudio.getState().playing) useStudio.setState({ recording: true })
    setStarting(false)
  }
  const stopTake = () => { generation.current.version++; stop(); setStarting(false) }
  return <section className="jam-workspace" aria-label="YouTube Jam workspace">
    <div className="jam-heading"><div><span className="eyebrow">YOUTUBE / LOCAL PADS</span><h1>Jam room</h1></div><span className="tag">16-STEP TAKES</span></div>
    <form className="youtube-form" onSubmit={event => {
      event.preventDefault()
      const parsed = parseYouTubeUrl(url)
      if (!parsed) { setUrlError('Enter a valid YouTube video URL (watch, share, Shorts, or live).'); return }
      setUrlError(''); setMessage('')
      edit('YouTube backing video', draft => { draft.jamSource = parsed })
    }}><Link size={16} /><input aria-label="YouTube video URL" placeholder="Paste a YouTube video URL" value={url} onChange={event => setUrl(event.target.value)} /><button disabled={!ready || !url.trim()} type="submit">Load video</button></form>
    {urlError && <p className="jam-validation" role="alert">{urlError}</p>}
    <div className="jam-layout"><div className="youtube-player">
      {source ? <iframe key={`${source.videoId}-${source.start}`} title="YouTube backing video" src={`https://www.youtube-nocookie.com/embed/${source.videoId}?start=${source.start}&playsinline=1&rel=0`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen /> : <div className="youtube-empty"><Link size={30} /><span>No backing video</span></div>}
      {source && <div className="video-actions"><a href={`https://www.youtube.com/watch?v=${source.videoId}&t=${source.start}s`} target="_blank" rel="noreferrer"><ExternalLink size={12} />Open on YouTube</a><button onClick={() => edit('Remove backing video', draft => { delete draft.jamSource })}>Remove video</button></div>}
    </div><div className="jam-take">
      <div className="section-heading"><h2>Pad performance</h2><span>{noteCount} NOTES</span></div>
      <div className="take-content"><strong className="take-pattern">{pattern?.name ?? 'No take'}</strong><div className="take-buttons"><button disabled={!ready || starting || recording} onClick={() => void recordTake()} aria-pressed={recording}><Circle size={14} fill={recording ? 'currentColor' : 'none'} />{recording ? 'Recording' : 'Record take'}</button><button aria-label="Stop Jam recording" disabled={!playing && !starting} onClick={stopTake}><Square size={14} /></button><button disabled={!ready || starting} onClick={newTake}><Plus size={14} />New take</button></div>
      <label>Section name<input aria-label="Jam section name" value={name} maxLength={32} onChange={event => setName(event.target.value)} /></label><label>Repeats<input aria-label="Jam repeat count" type="number" min={1} max={32} value={repeats} onChange={event => setRepeats(Math.max(1, Math.min(32, Number(event.target.value) || 1)))} /></label>
      <button className="add-jam-button" disabled={!ready || !noteCount || recording || starting} onClick={() => {
        stopTake()
        try { edit('Add Jam take to song', draft => { addJamToSong(draft, patternId, name, repeats) }); setMessage(`Added "${name.trim() || pattern?.name}" to the song (${repeats}x).`) }
        catch (error) { reportError(error) }
      }}><Plus size={15} />Add to song</button>
      {message && <div className="jam-success" role="status">{message}<button onClick={openStudio}>Open song in Studio<ArrowRight size={14} /></button></div>}
      </div>
    </div></div>
    <p className="youtube-limit">YouTube audio is playback-only, is not sampled, and is excluded from WAV exports. Video playback is independent of the pad clock. Recorded pad notes and your local samples are included in the song.</p>
  </section>
}