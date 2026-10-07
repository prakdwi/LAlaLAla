import { Save, Waves } from 'lucide-react'
import { saveSynthToLibrary } from '../db/library'
import { useStudio } from '../state/store'
import { makeSynth } from '../state/defaults'
import type { SynthParams, Track } from '../state/types'
import { Range } from './Controls'

const PRESETS: Record<string, Partial<SynthParams>> = {
  Init: {},
  'Warm pad': {
    osc1: 'sawtooth',
    osc2: 'sawtooth',
    osc2Detune: 0.1,
    osc2Level: 0.8,
    cutoff: 900,
    resonance: 0.6,
    envAmount: 0.2,
    attack: 0.6,
    decay: 0.8,
    sustain: 0.8,
    release: 1.2,
    unison: 3,
    spread: 0.6,
  },
  'Pluck bass': {
    osc1: 'square',
    osc2: 'sawtooth',
    osc2Detune: -12,
    osc2Level: 0.6,
    subLevel: 0.6,
    cutoff: 300,
    resonance: 3,
    envAmount: 0.6,
    attack: 0.003,
    decay: 0.18,
    sustain: 0.1,
    release: 0.12,
    unison: 1,
  },
  'Lead saw': {
    osc1: 'sawtooth',
    osc2: 'sawtooth',
    osc2Detune: 0.08,
    osc2Level: 0.7,
    cutoff: 3500,
    resonance: 1.5,
    envAmount: 0.4,
    attack: 0.01,
    decay: 0.3,
    sustain: 0.7,
    release: 0.25,
    unison: 5,
    spread: 0.3,
    glide: 0.04,
  },
  'Chip square': {
    osc1: 'square',
    osc2: 'square',
    osc2Detune: 12,
    osc2Level: 0.3,
    subLevel: 0,
    cutoff: 8000,
    resonance: 0.3,
    envAmount: 0,
    attack: 0.002,
    decay: 0.1,
    sustain: 0.9,
    release: 0.05,
    unison: 1,
  },
  'Noise hit': {
    osc1: 'triangle',
    osc2Level: 0,
    subLevel: 0,
    noiseLevel: 1,
    cutoff: 2000,
    resonance: 6,
    envAmount: 0.9,
    attack: 0.001,
    decay: 0.2,
    sustain: 0,
    release: 0.1,
  },
}

const WAVES: OscillatorType[] = ['sine', 'triangle', 'sawtooth', 'square']

export function SynthPanel({ track }: { track: Track }) {
  const edit = useStudio(state => state.edit)
  const synth = track.synth ?? makeSynth()
  return (
    <section className="synth-section" aria-label="Synthesizer">
      <div className="section-heading">
        <h2>
          <Waves size={15} />
          Synthesizer
        </h2>
        <div className="inline-actions">
          <select
            aria-label="Synth preset"
            value=""
            onChange={event => {
              const preset = PRESETS[event.target.value]
              if (preset)
                edit('Synth preset', draft => {
                  const target = draft.tracks.find(item => item.id === track.id)
                  if (target) target.synth = { ...makeSynth(), ...preset }
                })
            }}
          >
            <option value="">Presets…</option>
            {Object.keys(PRESETS).map(name => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <button
            onClick={() => void saveSynthToLibrary(track.name, synth)}
            title="Save this patch to the sound library"
          >
            <Save size={13} />
            Save patch
          </button>
        </div>
      </div>
      <SynthControls
        synth={synth}
        onChange={next =>
          edit(
            'Synth',
            draft => {
              const target = draft.tracks.find(item => item.id === track.id)
              if (target) target.synth = next
            },
            `${track.id}-synth`,
          )
        }
      />
    </section>
  )
}

/** Prop-driven synth controls, shared by the Studio synth panel and the Sound Lab. */
export function SynthControls({ synth, onChange }: { synth: SynthParams; onChange: (synth: SynthParams) => void }) {
  const update = <K extends keyof SynthParams>(key: K, value: SynthParams[K]) => onChange({ ...synth, [key]: value })
  return (
    <div className="synth-body">
      <div className="synth-group">
        <span className="eyebrow">OSCILLATORS</span>
        <div className="segmented" role="group" aria-label="Oscillator 1 wave">
          {WAVES.map(wave => (
            <button key={wave} className={synth.osc1 === wave ? 'selected' : ''} onClick={() => update('osc1', wave)}>
              {wave.slice(0, 3)}
            </button>
          ))}
        </div>
        <div className="segmented" role="group" aria-label="Oscillator 2 wave">
          {WAVES.map(wave => (
            <button key={wave} className={synth.osc2 === wave ? 'selected' : ''} onClick={() => update('osc2', wave)}>
              {wave.slice(0, 3)}
            </button>
          ))}
        </div>
        <div className="pad-parameters">
          <Range
            label="Osc 2 detune"
            value={synth.osc2Detune}
            min={-24}
            max={24}
            step={0.01}
            format={`${synth.osc2Detune.toFixed(2)} st`}
            onChange={value => update('osc2Detune', value)}
          />
          <Range
            label="Osc 2 level"
            value={synth.osc2Level}
            min={0}
            max={1}
            onChange={value => update('osc2Level', value)}
          />
          <Range label="Sub" value={synth.subLevel} min={0} max={1} onChange={value => update('subLevel', value)} />
          <Range
            label="Noise"
            value={synth.noiseLevel}
            min={0}
            max={1}
            onChange={value => update('noiseLevel', value)}
          />
          <Range
            label="Unison"
            value={synth.unison}
            min={1}
            max={7}
            step={1}
            format={`${synth.unison} voices`}
            onChange={value => update('unison', value)}
          />
          <Range label="Spread" value={synth.spread} min={0} max={1} onChange={value => update('spread', value)} />
        </div>
      </div>
      <div className="synth-group">
        <span className="eyebrow">FILTER & ENVELOPE</span>
        <div className="pad-parameters">
          <Range
            label="Cutoff"
            value={Math.log2(synth.cutoff)}
            min={Math.log2(30)}
            max={Math.log2(18000)}
            step={0.01}
            format={`${Math.round(synth.cutoff)} Hz`}
            onChange={value => update('cutoff', 2 ** value)}
          />
          <Range
            label="Resonance"
            value={synth.resonance}
            min={0.1}
            max={15}
            format={`${synth.resonance.toFixed(1)} Q`}
            onChange={value => update('resonance', value)}
          />
          <Range
            label="Env amount"
            value={synth.envAmount}
            min={0}
            max={1}
            onChange={value => update('envAmount', value)}
          />
          <Range
            label="Glide"
            value={synth.glide}
            min={0}
            max={0.5}
            step={0.001}
            format={`${Math.round(synth.glide * 1000)} ms`}
            onChange={value => update('glide', value)}
          />
        </div>
        <div className="pad-parameters">
          <Range
            label="Attack"
            value={synth.attack}
            min={0.001}
            max={2}
            step={0.001}
            format={`${Math.round(synth.attack * 1000)} ms`}
            onChange={value => update('attack', value)}
          />
          <Range
            label="Decay"
            value={synth.decay}
            min={0.01}
            max={3}
            step={0.01}
            format={`${synth.decay.toFixed(2)} s`}
            onChange={value => update('decay', value)}
          />
          <Range label="Sustain" value={synth.sustain} min={0} max={1} onChange={value => update('sustain', value)} />
          <Range
            label="Release"
            value={synth.release}
            min={0.01}
            max={4}
            step={0.01}
            format={`${synth.release.toFixed(2)} s`}
            onChange={value => update('release', value)}
          />
        </div>
      </div>
    </div>
  )
}
