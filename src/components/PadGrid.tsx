import { Grid2X2 } from 'lucide-react'
import { padKeys, triggerPad } from '../state/actions'
import { useStudio } from '../state/store'

export function PadGrid() {
  const { project, selectedTrackId, selectedPadId, flashes, ready } = useStudio()
  const track = project.tracks.find(item => item.id === selectedTrackId)!
  return <section className="pads-section">
    <div className="section-heading"><h2><Grid2X2 size={15} />Performance pads</h2><span>Bank A <b>01-16</b></span></div>
    <div className="pad-grid">{track.pads.map((pad, index) => <button key={pad.id} disabled={!ready} className={`pad ${pad.id === selectedPadId ? 'selected' : ''} ${flashes[pad.id] ? 'hit' : ''}`} onPointerDown={event => { event.preventDefault(); void triggerPad(track, pad) }} onClick={event => { if (event.detail === 0) void triggerPad(track, pad) }} aria-label={`Pad ${index + 1}`} aria-pressed={selectedPadId === pad.id}>
      <span className="pad-top"><span>{String(index + 1).padStart(2, '0')}</span><kbd>{padKeys[index].toUpperCase()}</kbd></span>
      <span className="pad-name">{track.name}<small>{index === 0 ? 'ORIGINAL' : `SLICE ${String(index + 1).padStart(2, '0')}`}</small></span>
      <span className="pad-line" />
    </button>)}</div>
    <div className="section-foot"><span>POLYPHONIC</span><span>16 PADS <b>/</b> BANK A</span></div>
  </section>
}