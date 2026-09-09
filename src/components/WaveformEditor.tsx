import { useEffect, useRef, useState } from 'react'
import { Scissors, Upload, ZoomIn, ZoomOut } from 'lucide-react'
import { engine } from '../audio/engine'
import { detectSlices } from '../audio/slicing'
import { makePad, uid } from '../state/defaults'
import { reportError, useStudio } from '../state/store'
import type { Pad } from '../state/types'
import { IconButton, Range } from './Controls'

export function WaveformEditor() {
  const { project, selectedTrackId, selectedPadId, edit, ready } = useStudio()
  const track = project.tracks.find(item => item.id === selectedTrackId)!
  const pad = track.pads.find(item => item.id === selectedPadId) ?? track.pads[0]
  const buffer = engine.buffers.get(track.sampleBufferId)
  const canvas = useRef<HTMLCanvasElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const [zoom, setZoom] = useState(1)
  const [scroll, setScroll] = useState(0)
  const [loading, setLoading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const marker = useRef<'startTime' | 'endTime' | null>(null)
  const duration = buffer?.duration ?? 1
  const viewLength = duration / zoom
  const viewStart = scroll * (duration - viewLength)
  const updatePad = (key: keyof Pad, value: number | boolean) => edit(`Pad ${key}`, draft => {
    const target = draft.tracks.find(item => item.id === track.id)?.pads.find(item => item.id === pad.id)
    if (target) Object.assign(target, { [key]: value })
  }, `${pad.id}-${key}`)
  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const draw = () => {
      const width = element.clientWidth
      const height = element.clientHeight
      element.width = width * devicePixelRatio; element.height = height * devicePixelRatio
      const context = element.getContext('2d')!
      context.scale(devicePixelRatio, devicePixelRatio)
      context.fillStyle = '#b9c86d'; context.fillRect(0, 0, width, height)
      for (let index = 0; index <= 8; index++) {
        context.strokeStyle = '#a1b05c'; context.beginPath(); context.moveTo(index * width / 8, 0); context.lineTo(index * width / 8, height); context.stroke()
      }
      const x = (time: number) => (time - viewStart) / viewLength * width
      context.fillStyle = '#d8df9226'; context.fillRect(x(pad.startTime), 0, x(pad.endTime) - x(pad.startTime), height)
      if (buffer) {
        const data = buffer.getChannelData(0)
        context.strokeStyle = '#394419'; context.lineWidth = 1
        context.beginPath()
        for (let pixel = 0; pixel < width; pixel++) {
          const first = Math.floor((viewStart + pixel / width * viewLength) * buffer.sampleRate)
          const last = Math.min(data.length, Math.ceil((viewStart + (pixel + 1) / width * viewLength) * buffer.sampleRate))
          let low = 0; let high = 0
          for (let sample = first; sample < last; sample++) { low = Math.min(low, data[sample]); high = Math.max(high, data[sample]) }
          context.moveTo(pixel, height / 2 + low * height * 0.42); context.lineTo(pixel, height / 2 + high * height * 0.42)
        }
        context.stroke()
      }
      for (const region of track.pads) {
        context.fillStyle = '#71803b'; context.fillRect(x(region.startTime), height - 8, 1, 8)
      }
      for (const [time, label] of [[pad.startTime, 'IN'], [pad.endTime, 'OUT']] as const) {
        const position = Math.max(0, Math.min(width - 2, x(time)))
        context.fillStyle = '#a43b25'; context.fillRect(position, 0, 2, height)
        context.fillRect(Math.min(position, width - 32), 0, 32, 19)
        context.fillStyle = '#f1dfbd'; context.font = '10px monospace'; context.fillText(label, Math.min(position, width - 32) + 5, 13)
      }
    }
    const observer = new ResizeObserver(draw); observer.observe(element); draw()
    return () => observer.disconnect()
  }, [buffer, pad, track.pads, viewStart, viewLength])
  const slice = (audio: AudioBuffer, bufferId: string) => {
    const starts = detectSlices(audio.getChannelData(0), audio.sampleRate)
    const pads = Array.from({ length: 16 }, (_, index) => {
      const region = index % starts.length
      return makePad(starts[region], starts[region + 1] ?? audio.duration)
    })
    edit('Load and slice sample', draft => {
      const target = draft.tracks.find(item => item.id === track.id)!
      const oldPads = target.pads.map(item => item.id)
      target.sampleBufferId = bufferId; target.pads = pads; target.sequencerPadId = pads[0].id
      for (const pattern of draft.patterns) for (const step of pattern.trackSteps.find(row => row.trackId === track.id)?.steps ?? []) {
        if (step.padId) step.padId = pads[Math.max(0, oldPads.indexOf(step.padId))]?.id
      }
    })
    useStudio.setState({ selectedPadId: pads[0].id })
  }
  const upload = async (file?: File) => {
    if (!file) return
    if (file.size > 100 * 1024 * 1024) { reportError('Please use a sample smaller than 100 MB.'); return }
    setLoading(true)
    try { const id = uid(); const audio = await engine.decode(id, file); engine.graph?.stopTrack(track.id); slice(audio, id) }
    catch { reportError('This audio file could not be decoded. Try WAV, MP3, OGG, or M4A supported by your browser.') }
    finally { setLoading(false); if (picker.current) picker.current.value = '' }
  }
  return <section className={`sample-section ${dragging ? 'drop-active' : ''}`} onDragOver={event => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); void upload(event.dataTransfer.files[0]) }}>
    <div className="section-heading"><h2>Sample editor</h2><div className="inline-actions"><button disabled={!buffer || loading} onClick={() => buffer && slice(buffer, track.sampleBufferId)}><Scissors size={13} />Auto-slice</button><button disabled={loading || !ready} onClick={() => picker.current?.click()}><Upload size={13} />{loading ? 'Decoding...' : 'Load sample'}</button></div></div>
    <input ref={picker} type="file" accept="audio/*,.wav,.mp3,.ogg,.m4a,.flac" hidden onChange={event => void upload(event.target.files?.[0])} />
    <div className="sample-info"><div><span className="sample-icon">WAV</span><strong>{track.name}<small>{buffer ? `${buffer.sampleRate / 1000} kHz / ${buffer.numberOfChannels === 1 ? 'MONO' : 'STEREO'}` : 'NO AUDIO LOADED'}</small></strong></div><span>{duration.toFixed(3)} s</span></div>
    <div className="waveform-wrap"><canvas ref={canvas} aria-label="Sample waveform with draggable trim markers" onPointerDown={event => {
      const bounds = event.currentTarget.getBoundingClientRect()
      const time = viewStart + (event.clientX - bounds.left) / bounds.width * viewLength
      marker.current = Math.abs(time - pad.startTime) < Math.abs(time - pad.endTime) ? 'startTime' : 'endTime'
      event.currentTarget.setPointerCapture(event.pointerId)
    }} onPointerMove={event => {
      if (!marker.current) return
      const bounds = event.currentTarget.getBoundingClientRect()
      const time = Math.max(0, Math.min(duration, viewStart + (event.clientX - bounds.left) / bounds.width * viewLength))
      updatePad(marker.current, marker.current === 'startTime' ? Math.min(time, pad.endTime - 0.001) : Math.max(time, pad.startTime + 0.001))
    }} onPointerUp={() => { marker.current = null }} onPointerCancel={() => { marker.current = null }} />
    <div className="wave-times">{Array.from({ length: 5 }, (_, index) => <span key={index}>{(viewStart + viewLength * index / 4).toFixed(2)}s</span>)}</div></div>
    <div className="wave-toolbar"><span>SLICE {String(track.pads.indexOf(pad) + 1).padStart(2, '0')}<b> / 16</b></span><input aria-label="Waveform scroll" type="range" min="0" max="1" step="0.001" value={scroll} disabled={zoom === 1} onChange={event => setScroll(Number(event.target.value))} /><IconButton title="Zoom out" onClick={() => setZoom(Math.max(1, zoom / 2))}><ZoomOut size={15} /></IconButton><span>{zoom}x</span><IconButton title="Zoom in" onClick={() => setZoom(Math.min(64, zoom * 2))}><ZoomIn size={15} /></IconButton></div>
    <div className="trim-inputs">{(['startTime', 'endTime'] as const).map(key => <label key={key}>{key === 'startTime' ? 'Start' : 'End'}<input aria-label={`Slice ${key === 'startTime' ? 'start' : 'end'}`} type="number" step="0.001" min="0" max={duration} value={Number(pad[key].toFixed(3))} onChange={event => updatePad(key, key === 'startTime' ? Math.max(0, Math.min(pad.endTime - 0.001, Number(event.target.value))) : Math.min(duration, Math.max(pad.startTime + 0.001, Number(event.target.value))))} /><span>s</span></label>)}<label>Choke<select aria-label="Choke group" value={pad.chokeGroup} onChange={event => updatePad('chokeGroup', Number(event.target.value))}><option value="0">Off</option>{[1, 2, 3, 4].map(group => <option key={group}>{group}</option>)}</select></label><label className="check-label"><input type="checkbox" checked={pad.loop} onChange={event => updatePad('loop', event.target.checked)} />Loop</label></div>
    <div className="pad-parameters"><Range label="Gain" value={pad.gain} min={0} max={1.5} onChange={value => updatePad('gain', value)} /><Range label="Pitch" value={pad.pitchSemitones} min={-24} max={24} step={1} format={`${pad.pitchSemitones} st`} onChange={value => updatePad('pitchSemitones', value)} /><Range label="Pad pan" value={pad.pan} min={-1} max={1} onChange={value => updatePad('pan', value)} /><Range label="Attack" value={pad.attack} min={0.001} max={0.3} step={0.001} format={`${Math.round(pad.attack * 1000)} ms`} onChange={value => updatePad('attack', value)} /><Range label="Release" value={pad.release} min={0.003} max={0.5} step={0.001} format={`${Math.round(pad.release * 1000)} ms`} onChange={value => updatePad('release', value)} /></div>
  </section>
}