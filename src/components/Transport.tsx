import { useEffect, useRef } from 'react'
import { Circle, Play, Square } from 'lucide-react'
import { engine } from '../audio/engine'
import { useStudio } from '../state/store'
import { play, stop } from '../state/actions'
import { IconButton } from './Controls'

export function Transport() {
  const { project, edit, playing, recording, playhead, ready } = useStudio()
  const meter = useRef<HTMLCanvasElement>(null)
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
          context.fillStyle = index / 28 < level ? '#8abb43' : '#38382a'
          context.fillRect(index * 5, 0, 3, 14)
        }
        canvas.dataset.level = rms.toFixed(5)
      }
      frame = requestAnimationFrame(draw)
    }
    draw(); return () => cancelAnimationFrame(frame)
  }, [])
  return <div className="transport">
    <div className="transport-buttons">
      <button className={`play-button ${playing ? 'running' : ''}`} aria-label={playing ? 'Stop playback' : 'Play pattern'} disabled={!ready} onClick={() => playing ? stop() : void play()}><Play size={17} fill="currentColor" />{playing ? 'Playing' : 'Play'}</button>
      <IconButton title="Stop" onClick={stop}><Square size={16} fill="currentColor" /></IconButton>
      <IconButton title="Record pads into pattern" disabled={!ready} aria-pressed={recording} onClick={() => { if (useStudio.getState().songMode) stop(); useStudio.setState({ recording: !recording }); if (!engine.playing) void play() }}><Circle size={17} fill={recording ? 'currentColor' : 'none'} /></IconButton>
    </div>
    <div className="position"><strong>01<span> : </span>{String(Math.floor(Math.max(0, playhead) / 4) + 1).padStart(2, '0')}<span> : </span>{String(Math.max(0, playhead) % 4 + 1).padStart(2, '0')}</strong><small>{recording ? 'PAD RECORDING' : '4 / 4 TIME'}</small></div>
    <label className="tempo"><input aria-label="BPM" type="number" min="40" max="240" value={project.bpm} onChange={event => { stop(); edit('Tempo', draft => { draft.bpm = Math.max(40, Math.min(240, Number(event.target.value) || 40)) }, 'bpm') }} /><span>BPM</span></label>
    <label className="swing">Swing <output>{Math.round(project.swing * 100)}%</output><input aria-label="Swing" type="range" min="0" max="1" step="0.01" value={project.swing} onChange={event => { stop(); edit('Swing', draft => { draft.swing = Number(event.target.value) }, 'swing') }} /></label>
    <div className="master-meter"><span>MASTER <small>-60 <span>0 dB</span></small></span><canvas ref={meter} width="140" height="14" aria-label="Live master level" /><input aria-label="Master volume" type="range" min="0" max="1.2" step="0.01" value={project.masterVolume} onChange={event => edit('Master volume', draft => { draft.masterVolume = Number(event.target.value) }, 'master')} /></div>
    <div className="engine-status"><i className={playing ? 'live' : ''} />{playing ? 'AUDIO RUNNING' : 'ENGINE READY'}<small>WEB AUDIO / LOCAL</small></div>
  </div>
}