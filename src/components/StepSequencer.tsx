import { useRef, useState } from 'react'
import { Copy, Plus, X } from 'lucide-react'
import { useStudio } from '../state/store'
import { selectTrack, stop } from '../state/actions'
import { uid } from '../state/defaults'
import { IconButton, Range } from './Controls'

export function StepSequencer() {
  const { project, patternId, selectedTrackId, playhead, playing, edit } = useStudio()
  const pattern = project.patterns.find(item => item.id === patternId) ?? project.patterns[0]
  const [detail, setDetail] = useState<{ trackId: string; index: number } | null>(null)
  const press = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const longPressed = useRef(false)
  const step = detail ? pattern.trackSteps.find(row => row.trackId === detail.trackId)?.steps[detail.index] : undefined
  const createPattern = (copy: boolean) => {
    const id = uid()
    edit(copy ? 'Duplicate pattern' : 'New pattern', draft => {
      draft.patterns.push({ id, name: `Pattern ${String.fromCharCode(65 + draft.patterns.length)}`, trackSteps: pattern.trackSteps.map(row => ({ trackId: row.trackId, steps: row.steps.map(item => ({ ...item, active: copy && item.active })) })) })
    })
    stop(); useStudio.setState({ patternId: id })
  }
  return <section className="sequencer-section">
    <div className="section-heading"><h2>Step sequencer <span className="tag">16 STEPS</span></h2><div className="inline-actions"><select aria-label="Pattern" value={pattern.id} onChange={event => { stop(); useStudio.setState({ patternId: event.target.value }) }}>{project.patterns.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select><IconButton title="Duplicate pattern" onClick={() => createPattern(true)}><Copy size={14} /></IconButton><IconButton title="New pattern" onClick={() => createPattern(false)}><Plus size={16} /></IconButton></div></div>
    <div className="sequencer-scroll"><div className="sequencer-grid"><div className="step-ruler"><span>TRACK / PAD</span>{Array.from({ length: 16 }, (_, index) => <span key={index} className={index % 4 === 0 ? 'beat-number' : ''}>{String(index + 1).padStart(2, '0')}</span>)}</div>
      {pattern.trackSteps.map((row, rowIndex) => {
        const track = project.tracks.find(item => item.id === row.trackId)!
        return <div className={`step-row ${selectedTrackId === track.id ? 'selected-track' : ''}`} key={row.trackId}>
          <div className="step-track"><button onClick={() => selectTrack(track)}><span className="track-number">{String(rowIndex + 1).padStart(2, '0')}</span><strong>{track.name}</strong></button><select aria-label={`${track.name} sequencer pad`} value={track.sequencerPadId} onChange={event => edit('Sequencer pad', draft => { draft.tracks.find(item => item.id === track.id)!.sequencerPadId = event.target.value })}>{track.pads.map((pad, index) => <option key={pad.id} value={pad.id}>P{String(index + 1).padStart(2, '0')}</option>)}</select></div>
          {row.steps.map((item, index) => <button aria-label={`${track.name} step ${index + 1}`} aria-pressed={item.active} key={index} className={`step-cell ${item.active ? 'active' : ''} ${index % 4 === 0 ? 'beat-start' : ''} ${playing && playhead === index ? 'playhead' : ''}`} style={{ '--velocity': item.velocity } as React.CSSProperties} onClick={() => {
            if (longPressed.current) { longPressed.current = false; return }
            edit('Toggle step', draft => { const target = draft.patterns.find(value => value.id === pattern.id)!.trackSteps[rowIndex].steps[index]; target.active = !target.active })
          }} onContextMenu={event => { event.preventDefault(); setDetail({ trackId: track.id, index }) }} onPointerDown={() => {
            longPressed.current = false
            press.current = setTimeout(() => { longPressed.current = true; setDetail({ trackId: track.id, index }) }, 450)
          }} onPointerUp={() => clearTimeout(press.current)} onPointerLeave={() => clearTimeout(press.current)} onPointerCancel={() => clearTimeout(press.current)}><span /></button>)}
        </div>
      })}</div></div>
    {detail && step && <div className="step-detail"><strong>Step {detail.index + 1}</strong><Range label="Velocity" value={step.velocity} min={0.05} max={1} format={`${Math.round(step.velocity * 100)}%`} onChange={value => edit('Step velocity', draft => { draft.patterns.find(item => item.id === pattern.id)!.trackSteps.find(row => row.trackId === detail.trackId)!.steps[detail.index].velocity = value }, 'velocity')} /><Range label="Microtiming" value={step.microTimingMs} min={-50} max={50} step={1} format={`${step.microTimingMs} ms`} onChange={value => edit('Step timing', draft => { draft.patterns.find(item => item.id === pattern.id)!.trackSteps.find(row => row.trackId === detail.trackId)!.steps[detail.index].microTimingMs = value }, 'microtiming')} /><IconButton title="Close step editor" onClick={() => setDetail(null)}><X size={16} /></IconButton></div>}
    <div className="section-foot"><span>1 BAR <b>/</b> 1/16 RESOLUTION</span><span>{pattern.trackSteps.reduce((sum, row) => sum + row.steps.filter(item => item.active).length, 0)} ACTIVE STEPS</span></div>
  </section>
}