import { useState } from 'react'
import { Activity, Plus, Power, SlidersHorizontal, Trash2 } from 'lucide-react'
import { useStudio } from '../state/store'
import { addClip } from '../state/actions'
import { makeEffect } from '../state/defaults'
import type { EffectInstance, EffectParams, EffectType } from '../state/types'
import { Range } from './Controls'

const EFFECT_TYPES: EffectType[] = [
  'filter',
  'eq',
  'compressor',
  'delay',
  'reverb',
  'chorus',
  'saturation',
  'bitcrush',
  'limiter',
]
const LABEL: Record<EffectType, string> = {
  filter: 'FILTER',
  eq: '3-BAND EQ',
  compressor: 'COMPRESSOR',
  delay: 'DELAY',
  reverb: 'REVERB',
  chorus: 'CHORUS',
  saturation: 'SATURATION',
  bitcrush: 'BITCRUSH',
  limiter: 'LIMITER',
}

type Scope = 'track' | 'pad' | 'master'

export function EffectRack() {
  const { project, selectedTrackId, selectedPadId, selectedLaneId, edit } = useStudio()
  const [scope, setScope] = useState<Scope>('track')
  const [selectedId, setSelectedId] = useState('')
  const track = project.tracks.find(item => item.id === selectedTrackId) ?? project.tracks[0]
  const pad = track.pads.find(item => item.id === selectedPadId) ?? track.pads[0]
  const effects = scope === 'master' ? project.masterEffects : scope === 'track' ? track.effects : (pad?.effects ?? [])
  const effect = effects.find(item => item.id === selectedId) ?? effects[0]
  const update = (change: (target: EffectInstance) => void, key = 'effect') =>
    effect &&
    edit(
      `${scope} ${effect.type}`,
      draft => {
        const list =
          scope === 'master'
            ? draft.masterEffects
            : scope === 'track'
              ? draft.tracks.find(item => item.id === track.id)!.effects
              : draft.tracks.find(item => item.id === track.id)!.pads.find(item => item.id === pad.id)!.effects
        const target = list.find(item => item.id === effect.id)
        if (target) change(target)
      },
      `${scope}-${track.id}-${effect.id}-${key}`,
    )
  const listOf = (draft: typeof project) =>
    scope === 'master'
      ? draft.masterEffects
      : scope === 'track'
        ? draft.tracks.find(item => item.id === track.id)!.effects
        : draft.tracks.find(item => item.id === track.id)!.pads.find(item => item.id === pad.id)!.effects
  const param = <K extends keyof EffectParams>(key: K, value: EffectParams[K], label = key as string) =>
    update(target => {
      target.params[key] = value
    }, label)
  const automate = (key: keyof EffectParams) => {
    if (scope !== 'track' || !effect) return
    addClip('automation', selectedLaneId, 0, {
      target: { kind: 'effect', trackId: track.id, effectId: effect.id, param: key },
    })
  }
  const canAutomate = scope === 'track'
  const sidechainSources = project.tracks.filter(
    item => item.id !== track.id && item.kind !== 'bus' && item.kind !== 'audio',
  )
  return (
    <section className="effects-section">
      <div className="section-heading">
        <h2>
          <SlidersHorizontal size={15} />
          Effect rack
        </h2>
        <div className="inline-actions">
          <select
            aria-label="Effect scope"
            value={scope}
            onChange={event => {
              setScope(event.target.value as Scope)
              setSelectedId('')
            }}
          >
            <option value="track">{track.name} / Track</option>
            {track.pads.length > 0 && <option value="pad">Selected pad</option>}
            <option value="master">Master</option>
          </select>
          <select
            aria-label="Add effect"
            value=""
            onChange={event => {
              const type = event.target.value as EffectType
              if (!type) return
              let id = ''
              edit('Add effect', draft => {
                const created = makeEffect(type, true)
                id = created.id
                listOf(draft).push(created)
              })
              setSelectedId(id)
            }}
          >
            <option value="">+ Add effect…</option>
            {EFFECT_TYPES.map(type => (
              <option key={type} value={type}>
                {LABEL[type]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="effect-tabs" role="tablist">
        {effects.map(item => (
          <button
            role="tab"
            aria-selected={effect?.id === item.id}
            className={effect?.id === item.id ? 'selected' : ''}
            key={item.id}
            onClick={() => setSelectedId(item.id)}
          >
            <i className={item.enabled ? 'enabled' : ''} />
            {item.type}
          </button>
        ))}
        {!effects.length && <span className="eyebrow">No effects. Add one above.</span>}
      </div>
      {effect && (
        <div className="effect-body">
          <div className="effect-title">
            <span>{LABEL[effect.type]} / INSERT</span>
            <div className="inline-actions">
              <button
                aria-label={`Toggle ${scope} ${effect.type}`}
                aria-pressed={effect.enabled}
                onClick={() =>
                  update(target => {
                    target.enabled = !target.enabled
                  }, 'toggle')
                }
              >
                <Power size={14} />
                {effect.enabled ? 'On' : 'Bypass'}
              </button>
              <button
                aria-label={`Remove ${effect.type}`}
                onClick={() => {
                  edit('Remove effect', draft => {
                    const list = listOf(draft)
                    const index = list.findIndex(item => item.id === effect.id)
                    if (index >= 0) list.splice(index, 1)
                  })
                  setSelectedId('')
                }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
          {effect.type === 'filter' && (
            <>
              <div className="segmented">
                {(['lowpass', 'highpass', 'bandpass'] as const).map(mode => (
                  <button
                    key={mode}
                    className={effect.params.mode === mode ? 'selected' : ''}
                    onClick={() => param('mode', mode)}
                  >
                    {mode === 'lowpass' ? 'Low pass' : mode === 'highpass' ? 'High pass' : 'Band pass'}
                  </button>
                ))}
              </div>
              <Automatable on={canAutomate} onAutomate={() => automate('cutoff')}>
                <Range
                  label="Cutoff"
                  value={Math.log2(effect.params.cutoff)}
                  min={Math.log2(30)}
                  max={Math.log2(18000)}
                  step={0.01}
                  format={`${Math.round(effect.params.cutoff)} Hz`}
                  onChange={value => param('cutoff', 2 ** value)}
                />
              </Automatable>
              <Automatable on={canAutomate} onAutomate={() => automate('q')}>
                <Range
                  label="Resonance"
                  value={effect.params.q}
                  min={0.1}
                  max={15}
                  format={`${effect.params.q.toFixed(1)} Q`}
                  onChange={value => param('q', value)}
                />
              </Automatable>
            </>
          )}
          {effect.type === 'eq' && (
            <div className="pad-parameters">
              <Range
                label="Low"
                value={effect.params.lowGain}
                min={-18}
                max={18}
                step={0.5}
                format={`${effect.params.lowGain.toFixed(1)} dB`}
                onChange={value => param('lowGain', value)}
              />
              <Range
                label="Mid"
                value={effect.params.midGain}
                min={-18}
                max={18}
                step={0.5}
                format={`${effect.params.midGain.toFixed(1)} dB`}
                onChange={value => param('midGain', value)}
              />
              <Range
                label="Mid freq"
                value={Math.log2(effect.params.midFreq)}
                min={Math.log2(100)}
                max={Math.log2(8000)}
                step={0.01}
                format={`${Math.round(effect.params.midFreq)} Hz`}
                onChange={value => param('midFreq', 2 ** value)}
              />
              <Range
                label="High"
                value={effect.params.highGain}
                min={-18}
                max={18}
                step={0.5}
                format={`${effect.params.highGain.toFixed(1)} dB`}
                onChange={value => param('highGain', value)}
              />
            </div>
          )}
          {(effect.type === 'compressor' || effect.type === 'limiter') && (
            <>
              <div className="pad-parameters">
                <Range
                  label="Threshold"
                  value={effect.params.threshold}
                  min={-60}
                  max={0}
                  step={0.5}
                  format={`${effect.params.threshold.toFixed(1)} dB`}
                  onChange={value => param('threshold', value)}
                />
                {effect.type === 'compressor' && (
                  <>
                    <Range
                      label="Ratio"
                      value={effect.params.ratio}
                      min={1}
                      max={20}
                      step={0.1}
                      format={`${effect.params.ratio.toFixed(1)}:1`}
                      onChange={value => param('ratio', value)}
                    />
                    <Range
                      label="Attack"
                      value={effect.params.attack}
                      min={0.001}
                      max={0.3}
                      step={0.001}
                      format={`${Math.round(effect.params.attack * 1000)} ms`}
                      onChange={value => param('attack', value)}
                    />
                    <Range
                      label="Release"
                      value={effect.params.release}
                      min={0.02}
                      max={1.5}
                      step={0.01}
                      format={`${Math.round(effect.params.release * 1000)} ms`}
                      onChange={value => param('release', value)}
                    />
                    <Range
                      label="Knee"
                      value={effect.params.knee}
                      min={0}
                      max={40}
                      step={1}
                      format={`${effect.params.knee} dB`}
                      onChange={value => param('knee', value)}
                    />
                  </>
                )}
              </div>
              {effect.type === 'compressor' && scope !== 'pad' && (
                <label className="sidechain">
                  Sidechain from
                  <select
                    aria-label="Sidechain source"
                    value={effect.params.sidechainTrackId}
                    onChange={event => param('sidechainTrackId', event.target.value)}
                  >
                    <option value="">None</option>
                    {sidechainSources.map(source => (
                      <option key={source.id} value={source.id}>
                        {source.name}
                      </option>
                    ))}
                  </select>
                  <small>Ducks this channel whenever the source plays a note.</small>
                </label>
              )}
            </>
          )}
          {effect.type === 'delay' && (
            <>
              <div className="delay-controls">
                <label>
                  Time
                  <select
                    aria-label="Delay note length"
                    value={effect.params.division}
                    onChange={event => param('division', Number(event.target.value))}
                  >
                    {[
                      [0.25, '1/16'],
                      [0.5, '1/8'],
                      [0.75, '1/8 dotted'],
                      [1, '1/4'],
                      [1.5, '1/4 dotted'],
                      [2, '1/2'],
                    ].map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <span>{Math.round((60000 / project.bpm) * effect.params.division)} ms</span>
              </div>
              <Automatable on={canAutomate} onAutomate={() => automate('feedback')}>
                <Range
                  label="Feedback"
                  value={effect.params.feedback}
                  min={0}
                  max={0.85}
                  format={`${Math.round(effect.params.feedback * 100)}%`}
                  onChange={value => param('feedback', value)}
                />
              </Automatable>
            </>
          )}
          {effect.type === 'chorus' && (
            <div className="pad-parameters">
              <Range
                label="Rate"
                value={effect.params.rate}
                min={0.05}
                max={8}
                step={0.01}
                format={`${effect.params.rate.toFixed(2)} Hz`}
                onChange={value => param('rate', value)}
              />
              <Range
                label="Depth"
                value={effect.params.depth}
                min={0}
                max={0.02}
                step={0.0001}
                format={`${(effect.params.depth * 1000).toFixed(1)} ms`}
                onChange={value => param('depth', value)}
              />
            </div>
          )}
          {effect.type === 'saturation' && (
            <Automatable on={canAutomate} onAutomate={() => automate('drive')}>
              <Range
                label="Drive"
                value={effect.params.drive}
                min={0}
                max={1}
                format={`${Math.round(effect.params.drive * 100)}%`}
                onChange={value => param('drive', value)}
              />
            </Automatable>
          )}
          {effect.type === 'reverb' && (
            <div className="effect-readout">
              2.0 <small>SEC / ROOM</small>
            </div>
          )}
          {effect.type === 'bitcrush' && (
            <div className="effect-readout">
              5 <small>BIT / APPROXIMATION</small>
            </div>
          )}
          {!['filter', 'eq', 'compressor', 'limiter'].includes(effect.type) && (
            <Automatable on={canAutomate} onAutomate={() => automate('mix')}>
              <Range
                label="Dry / wet"
                value={effect.params.mix}
                min={0}
                max={1}
                format={`${Math.round(effect.params.mix * 100)}%`}
                onChange={value => param('mix', value)}
              />
            </Automatable>
          )}
        </div>
      )}
    </section>
  )
}

function Automatable({ on, onAutomate, children }: { on: boolean; onAutomate: () => void; children: React.ReactNode }) {
  return (
    <div className="automatable">
      {children}
      {on && (
        <button className="automate-button" title="Add an automation clip for this parameter" onClick={onAutomate}>
          <Activity size={11} />
          <Plus size={9} />
        </button>
      )}
    </div>
  )
}
