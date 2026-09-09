import { useStudio } from '../state/store'
import { selectTrack } from '../state/actions'

export function Mixer() {
  const { project, selectedTrackId, edit } = useStudio()
  return <section className="mixer-section"><div className="section-heading"><h2>Mixer</h2><span>{project.tracks.length} CHANNELS</span></div><div className="mixer-channels">{project.tracks.map((track, index) => <div className={`channel ${selectedTrackId === track.id ? 'selected' : ''}`} key={track.id}>
    <button className="channel-name" onClick={() => selectTrack(track)}><span>{String(index + 1).padStart(2, '0')}</span>{track.name}</button>
    <div className="channel-switches"><button aria-label={`Mute ${track.name}`} aria-pressed={track.mute} onClick={() => edit('Mute', draft => { draft.tracks[index].mute = !track.mute })}>M</button><button aria-label={`Solo ${track.name}`} aria-pressed={track.solo} onClick={() => edit('Solo', draft => { draft.tracks[index].solo = !track.solo })}>S</button></div>
    <div className="fader-area"><span className="fader-scale">+6<br />0<br />-12<br />-24<br />-inf</span><input className="fader" aria-label={`${track.name} volume`} type="range" min="0" max="1.5" step="0.01" value={track.volume} onChange={event => edit('Track volume', draft => { draft.tracks[index].volume = Number(event.target.value) }, `${track.id}-volume`)} /></div>
    <output className="db-value">{track.volume === 0 ? '-inf' : (20 * Math.log10(track.volume)).toFixed(1)} dB</output>
    <label className="pan-control"><span>L <b>PAN</b> R</span><input aria-label={`${track.name} pan`} type="range" min="-1" max="1" step="0.01" value={track.pan} onChange={event => edit('Track pan', draft => { draft.tracks[index].pan = Number(event.target.value) }, `${track.id}-pan`)} /></label>
    <div className="channel-inserts">{track.effects.slice(0, 2).map((effect, effectIndex) => <button key={effect.id} aria-label={`${track.name} ${effect.type} insert`} aria-pressed={effect.enabled} onClick={() => edit('Toggle insert', draft => { draft.tracks[index].effects[effectIndex].enabled = !effect.enabled })}><i />{effect.type === 'filter' ? 'FLT' : 'DLY'}</button>)}</div>
  </div>)}</div></section>
}