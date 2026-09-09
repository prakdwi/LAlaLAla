import { useState } from 'react'
import { Power, SlidersHorizontal } from 'lucide-react'
import { useStudio } from '../state/store'
import { makeEffect } from '../state/defaults'
import type { EffectInstance } from '../state/types'
import { Range } from './Controls'

export function EffectRack() {
  const { project, selectedTrackId, selectedPadId, edit } = useStudio()
  const [scope, setScope] = useState<'track' | 'pad'>('track')
  const [tab, setTab] = useState<EffectInstance['type']>('filter')
  const track = project.tracks.find(item => item.id === selectedTrackId)!
  const pad = track.pads.find(item => item.id === selectedPadId) ?? track.pads[0]
  const effects = scope === 'track' ? track.effects : pad.effects
  const effect = effects.find(item => item.type === tab) ?? makeEffect(tab)
  const update = (change: (target: EffectInstance) => void, key = 'effect') => edit(`${scope} ${tab}`, draft => {
    const targetTrack = draft.tracks.find(item => item.id === track.id)!
    const targetEffects = scope === 'track' ? targetTrack.effects : targetTrack.pads.find(item => item.id === pad.id)!.effects
    let target = targetEffects.find(item => item.type === tab)
    if (!target) { target = makeEffect(tab); targetEffects.push(target) }
    change(target)
  }, `${scope}-${track.id}-${tab}-${key}`)
  return <section className="effects-section"><div className="section-heading"><h2><SlidersHorizontal size={15} />Effect rack</h2><select aria-label="Effect scope" value={scope} onChange={event => setScope(event.target.value as 'track' | 'pad')}><option value="track">{track.name} / Track</option><option value="pad">Selected pad</option></select></div>
    <div className="effect-tabs" role="tablist">{(['filter', 'delay', 'reverb', 'bitcrush'] as const).map(type => <button role="tab" aria-selected={tab === type} className={tab === type ? 'selected' : ''} key={type} onClick={() => setTab(type)}><i className={effects.find(item => item.type === type)?.enabled ? 'enabled' : ''} />{type}</button>)}</div>
    <div className="effect-body"><div className="effect-title"><span>{tab === 'bitcrush' ? 'BITCRUSH / WAVESHAPER' : `${tab.toUpperCase()} / INSERT`}</span><button aria-label={`Toggle ${scope} ${tab}`} aria-pressed={effect.enabled} onClick={() => update(target => { target.enabled = !target.enabled }, 'toggle')}><Power size={14} />{effect.enabled ? 'On' : 'Bypass'}</button></div>
      {tab === 'filter' ? <><div className="segmented"><button className={effect.params.mode === 'lowpass' ? 'selected' : ''} onClick={() => update(target => { target.params.mode = 'lowpass' })}>Low pass</button><button className={effect.params.mode === 'highpass' ? 'selected' : ''} onClick={() => update(target => { target.params.mode = 'highpass' })}>High pass</button></div><Range label="Cutoff" value={Math.log2(effect.params.cutoff)} min={Math.log2(30)} max={Math.log2(18000)} step={0.01} format={`${Math.round(effect.params.cutoff)} Hz`} onChange={value => update(target => { target.params.cutoff = 2 ** value }, 'cutoff')} /><Range label="Resonance" value={effect.params.q} min={0.1} max={15} format={`${effect.params.q.toFixed(1)} Q`} onChange={value => update(target => { target.params.q = value }, 'q')} /></> : <>
        {tab === 'delay' && <div className="delay-controls"><label>Time<select aria-label="Delay note length" value={effect.params.division} onChange={event => update(target => { target.params.division = Number(event.target.value) })}>{[[0.25, '1/16'], [0.5, '1/8'], [0.75, '1/8 dotted'], [1, '1/4'], [2, '1/2']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><span>{Math.round(60000 / project.bpm * effect.params.division)} ms</span></div>}
        {tab === 'delay' && <Range label="Feedback" value={effect.params.feedback} min={0} max={0.85} format={`${Math.round(effect.params.feedback * 100)}%`} onChange={value => update(target => { target.params.feedback = value }, 'feedback')} />}
        {tab === 'reverb' && <div className="effect-readout">2.0 <small>SEC / ROOM</small></div>}
        {tab === 'bitcrush' && <div className="effect-readout">5 <small>BIT / APPROXIMATION</small></div>}
        <Range label="Dry / wet" value={effect.params.mix} min={0} max={1} format={`${Math.round(effect.params.mix * 100)}%`} onChange={value => update(target => { target.params.mix = value }, 'mix')} />
      </>}
    </div>
  </section>
}