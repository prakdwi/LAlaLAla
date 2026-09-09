import { useState } from 'react'
import { ArrowLeft, ArrowRight, GripVertical, Play, Plus, Trash2 } from 'lucide-react'
import { useStudio } from '../state/store'
import { uid } from '../state/defaults'
import { play, stop } from '../state/actions'
import { IconButton } from './Controls'

export function SongTimeline() {
  const { project, patternId, sectionId, edit, ready } = useStudio()
  const [selected, setSelected] = useState(project.song[0]?.id ?? '')
  const [dragged, setDragged] = useState('')
  const section = project.song.find(item => item.id === selected)
  const bars = project.song.reduce((sum, item) => sum + item.repeatCount, 0)
  const reorder = (from: string, to: string) => {
    if (from === to) return
    stop(); edit('Reorder sections', draft => {
      const first = draft.song.findIndex(item => item.id === from)
      const last = draft.song.findIndex(item => item.id === to)
      if (first < 0 || last < 0) return
      const [item] = draft.song.splice(first, 1); draft.song.splice(last, 0, item)
    })
  }
  return <section className="timeline-section"><div className="section-heading"><h2>Song arrangement <span className="tag">{bars} BARS</span></h2><div className="inline-actions"><button disabled={!project.song.length || !ready} onClick={() => void play(true)}><Play size={13} />Play song</button><IconButton title="Add song section" onClick={() => {
    const id = uid(); stop(); edit('Add section', draft => { draft.song.push({ id, name: `Section ${draft.song.length + 1}`, patternId, repeatCount: 2 }) }); setSelected(id)
  }}><Plus size={16} /></IconButton></div></div>
    <div className="timeline-ruler"><span>01</span><span>05</span><span>09</span><span>13</span><span>17</span></div>
    <div className="timeline-blocks">{project.song.length ? project.song.map((item, index) => <button draggable onDragStart={() => setDragged(item.id)} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); reorder(dragged, item.id) }} className={`song-block ${item.id === selected ? 'selected' : ''} ${item.id === sectionId ? 'current' : ''}`} style={{ flexGrow: item.repeatCount }} key={item.id} onClick={() => setSelected(item.id)}><span><GripVertical size={12} />{String(index + 1).padStart(2, '0')}<b>{item.repeatCount}x</b></span><strong>{item.name}</strong><small>{project.patterns.find(pattern => pattern.id === item.patternId)?.name}</small><div className="mini-steps">{Array.from({ length: 16 }, (_, step) => <i key={step} className={project.patterns.find(pattern => pattern.id === item.patternId)?.trackSteps.some(row => row.steps[step].active) ? 'on' : ''} />)}</div></button>) : <div className="empty-arrangement">No sections</div>}</div>
    {section && <div className="section-editor"><input aria-label="Section name" value={section.name} maxLength={32} onChange={event => edit('Section name', draft => { draft.song.find(item => item.id === section.id)!.name = event.target.value }, 'section-name')} /><select aria-label="Section pattern" value={section.patternId} onChange={event => { stop(); edit('Section pattern', draft => { draft.song.find(item => item.id === section.id)!.patternId = event.target.value }) }}>{project.patterns.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select><label>Repeat<input aria-label="Repeat count" type="number" min="1" max="32" value={section.repeatCount} onChange={event => { stop(); edit('Section repeats', draft => { draft.song.find(item => item.id === section.id)!.repeatCount = Math.max(1, Math.min(32, Number(event.target.value) || 1)) }) }} /></label><IconButton title="Move section left" disabled={project.song.indexOf(section) === 0} onClick={() => reorder(section.id, project.song[project.song.indexOf(section) - 1].id)}><ArrowLeft size={14} /></IconButton><IconButton title="Move section right" disabled={project.song.indexOf(section) === project.song.length - 1} onClick={() => reorder(section.id, project.song[project.song.indexOf(section) + 1].id)}><ArrowRight size={14} /></IconButton><IconButton title="Delete section" onClick={() => { stop(); edit('Delete section', draft => { draft.song = draft.song.filter(item => item.id !== section.id) }); setSelected('') }}><Trash2 size={14} /></IconButton></div>}
    <div className="section-foot"><span>{project.song.length} SECTIONS</span><span>{(bars * 240 / project.bpm).toFixed(1)} SEC <b>/</b> ARRANGEMENT</span></div>
  </section>
}