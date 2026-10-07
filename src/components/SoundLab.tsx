import { useEffect, useRef, useState } from 'react'
import {
  AudioLines,
  FlaskConical,
  Layers,
  Music2,
  Play,
  Plus,
  Save,
  Send,
  Trash2,
  Upload,
  VolumeX,
  Volume2,
  Waves,
} from 'lucide-react'
import { engine } from '../audio/engine'
import { DRUM_DEFAULTS, DRUM_LABELS, type DrumKind, type DrumParams } from '../audio/drums'
import { bufferToBlob, renderLab, type LabLayer } from '../audio/render'
import { detectSlices } from '../audio/slicing'
import { synthVoice } from '../audio/synth'
import { makeDrumLayer, makeSampleLayer, makeSynthLayer, useLab, type LabMode } from '../state/lab'
import { notify, reportError, useStudio } from '../state/store'
import { makeEffect, makeSynth, uid } from '../state/defaults'
import { saveSampleToLibrary, saveSynthToLibrary, loadLibraryItem } from '../db/library'
import type { EffectInstance, EffectParams, EffectType, SynthParams } from '../state/types'
import { Range, IconButton } from './Controls'
import { SynthControls } from './SynthPanel'
import { isBlackKey, noteName, PIANO_KEYS } from '../audio/midi'

const DRUMS: DrumKind[] = ['kick', 'snare', 'hat', 'clap', 'tom', 'perc']
const PROCESS_LABEL: Partial<Record<EffectType, string>> = {
  eq: 'EQ',
  saturation: 'Drive',
  filter: 'Filter',
  compressor: 'Comp',
  reverb: 'Space',
}

const layerKey = (layers: LabLayer[], process: unknown) => JSON.stringify([layers, process])

/** Third window: design sounds from scratch, then save them to the library or send them to a kit. */
export function SoundLab({ openJam }: { openJam: () => void }) {
  const lab = useLab()
  const { ready, project, selectedTrackId } = useStudio()
  const canvas = useRef<HTMLCanvasElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<AudioBufferSourceNode | null>(null)
  const layer = lab.layers.find(item => item.id === lab.selectedLayerId) ?? lab.layers[0]
  const key = layerKey(lab.layers, lab.process)

  // debounce re-render on any change
  useEffect(() => {
    if (lab.mode === 'synth') return
    const timer = setTimeout(async () => {
      if (!lab.layers.length) {
        useLab.setState({ rendered: undefined, renderedKey: key })
        return
      }
      useLab.setState({ rendering: true })
      try {
        const rendered = await renderLab(lab.layers, lab.process, engine.buffers, project.bpm)
        if (useLab.getState().layers === lab.layers && useLab.getState().process === lab.process)
          useLab.setState({ rendered, renderedKey: key })
      } catch (error) {
        reportError(error)
      } finally {
        useLab.setState({ rendering: false })
      }
    }, 120)
    return () => clearTimeout(timer)
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- key captures layers + process
  }, [key, lab.mode])

  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const draw = () => {
      const width = element.clientWidth
      const height = element.clientHeight
      element.width = width * devicePixelRatio
      element.height = height * devicePixelRatio
      const context = element.getContext('2d')!
      context.scale(devicePixelRatio, devicePixelRatio)
      context.fillStyle = '#b9c86d'
      context.fillRect(0, 0, width, height)
      const buffer = lab.rendered
      context.fillStyle = '#394419'
      context.font = '10px monospace'
      if (!buffer) {
        context.fillText(
          lab.mode === 'synth' ? 'PLAY THE KEYBOARD TO AUDITION THE PATCH' : 'RENDERING…',
          12,
          height / 2,
        )
        return
      }
      const data = buffer.getChannelData(0)
      context.strokeStyle = '#394419'
      context.beginPath()
      for (let pixel = 0; pixel < width; pixel++) {
        const from = Math.floor((pixel / width) * data.length)
        const to = Math.floor(((pixel + 1) / width) * data.length)
        let low = 0
        let high = 0
        for (let index = from; index < to; index++) {
          low = Math.min(low, data[index])
          high = Math.max(high, data[index])
        }
        context.moveTo(pixel, height / 2 + low * height * 0.45)
        context.lineTo(pixel, height / 2 + high * height * 0.45)
      }
      context.stroke()
      context.fillText(`${buffer.duration.toFixed(3)} s`, width - 70, 14)
    }
    const observer = new ResizeObserver(draw)
    observer.observe(element)
    draw()
    return () => observer.disconnect()
  }, [lab.rendered, lab.mode])

  const audition = async (rate = 1) => {
    if (!lab.rendered) return
    await engine.ready()
    preview?.stop()
    const context = engine.context!
    const source = context.createBufferSource()
    source.buffer = lab.rendered
    source.playbackRate.value = rate
    source.connect(engine.graph!.masterIn)
    source.start()
    setPreview(source)
  }

  const commit = async (): Promise<{ bufferId: string; slices: number[] } | undefined> => {
    const buffer = lab.rendered
    if (!buffer) {
      reportError('Nothing to save yet.')
      return
    }
    await engine.ready()
    const bufferId = uid()
    engine.register(bufferId, buffer, bufferToBlob(buffer))
    const slices =
      lab.mode === 'layer' && buffer.duration > 1 ? detectSlices(buffer.getChannelData(0), buffer.sampleRate) : [0]
    return { bufferId, slices }
  }

  const saveToLibrary = async () => {
    if (lab.mode === 'synth') {
      const synth = layer?.kind === 'synth' ? layer.synth : makeSynth()
      await saveSynthToLibrary(lab.name, synth)
      return
    }
    const result = await commit()
    if (result) await saveSampleToLibrary(lab.name, result.bufferId, result.slices, [lab.mode])
  }

  const sendToKit = async (newTrack: boolean) => {
    if (lab.mode === 'synth') {
      const synth = layer?.kind === 'synth' ? layer.synth : makeSynth()
      const item = await saveSynthToLibrary(lab.name, synth)
      if (item) await loadLibraryItem(item, { trackId: selectedTrackId, newTrack })
      return
    }
    const result = await commit()
    if (!result) return
    const item = await saveSampleToLibrary(lab.name, result.bufferId, result.slices, [lab.mode])
    if (item) {
      await loadLibraryItem(item, { trackId: selectedTrackId, newTrack })
      notify(`"${lab.name}" is on a kit. Open the Jam room to play it.`)
    }
  }

  const switchMode = (mode: LabMode) => {
    if (mode === lab.mode) return
    const fresh = mode === 'drum' ? makeDrumLayer('kick') : mode === 'synth' ? makeSynthLayer() : makeDrumLayer('kick')
    useLab.setState({
      mode,
      layers: [fresh],
      selectedLayerId: fresh.id,
      name: mode === 'synth' ? 'New patch' : mode === 'drum' ? 'New kick' : 'New layered sound',
      rendered: undefined,
    })
  }

  const loadFile = async (file?: File) => {
    if (!file) return
    try {
      await engine.ready()
      const id = uid()
      await engine.decode(id, file)
      lab.addLayer(makeSampleLayer(id))
      if (lab.mode !== 'layer') useLab.setState({ mode: 'layer' })
    } catch {
      reportError('That audio file could not be decoded.')
    } finally {
      if (picker.current) picker.current.value = ''
    }
  }

  const target = project.tracks.find(item => item.id === selectedTrackId)
  const targetOk = lab.mode === 'synth' ? target?.kind === 'synth' : target?.kind === 'drums' || target?.kind === 'keys'

  return (
    <section className="sound-lab" aria-label="Sound Lab">
      <div className="jam-heading">
        <div>
          <span className="eyebrow">DESIGN / LAYER / PROCESS</span>
          <h1>Sound Lab</h1>
        </div>
        <div className="lab-modes" role="tablist" aria-label="Lab mode">
          {(
            [
              ['drum', 'Drum synth', AudioLines],
              ['synth', 'Synth patch', Waves],
              ['layer', 'Layer & resample', Layers],
            ] as const
          ).map(([mode, label, Icon]) => (
            <button
              key={mode}
              role="tab"
              aria-selected={lab.mode === mode}
              className={`toggle ${lab.mode === mode ? 'on' : ''}`}
              onClick={() => switchMode(mode)}
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="lab-output">
        <div className="lab-name">
          <FlaskConical size={16} />
          <input
            aria-label="Sound name"
            value={lab.name}
            maxLength={32}
            onChange={event => lab.set({ name: event.target.value })}
          />
        </div>
        <div className="waveform-wrap lab-wave">
          <canvas ref={canvas} aria-label="Rendered sound waveform" onPointerDown={() => void audition()} />
        </div>
        <div className="lab-actions">
          {lab.mode !== 'synth' && (
            <button
              className="play-button"
              disabled={!lab.rendered || !ready}
              onClick={() => void audition()}
              aria-label="Audition sound"
            >
              <Play size={14} fill="currentColor" />
              Audition
            </button>
          )}
          <button disabled={!ready || (lab.mode !== 'synth' && !lab.rendered)} onClick={() => void saveToLibrary()}>
            <Save size={13} />
            Save to library
          </button>
          <button
            disabled={!ready || (lab.mode !== 'synth' && !lab.rendered)}
            onClick={() => void sendToKit(!targetOk)}
            title={targetOk ? `Replace the sound on ${target?.name}` : 'Creates a new track'}
          >
            <Send size={13} />
            {targetOk ? `Send to ${target?.name}` : 'Send to new track'}
          </button>
          {targetOk && (
            <button disabled={!ready || (lab.mode !== 'synth' && !lab.rendered)} onClick={() => void sendToKit(true)}>
              <Plus size={13} />
              New track
            </button>
          )}
          <button onClick={openJam}>
            <Music2 size={13} />
            Open Jam room
          </button>
          <span className="eyebrow">
            {lab.rendering ? 'RENDERING…' : lab.rendered ? `${lab.rendered.duration.toFixed(2)} S / 44.1 KHZ` : ''}
          </span>
        </div>
      </div>

      {lab.mode === 'synth' && layer?.kind === 'synth' ? (
        <SynthDesigner
          synth={layer.synth}
          onChange={synth => lab.updateLayer(layer.id, current => ({ ...current, synth }) as LabLayer)}
        />
      ) : (
        <div className="lab-layout">
          <div className="lab-layers">
            <div className="section-heading">
              <h2>Layers</h2>
              <div className="inline-actions">
                {lab.mode === 'layer' && (
                  <>
                    <select
                      aria-label="Add drum layer"
                      value=""
                      onChange={event =>
                        event.target.value && lab.addLayer(makeDrumLayer(event.target.value as DrumKind))
                      }
                    >
                      <option value="">+ Drum…</option>
                      {DRUMS.map(drum => (
                        <option key={drum} value={drum}>
                          {DRUM_LABELS[drum]}
                        </option>
                      ))}
                    </select>
                    <IconButton title="Add synth layer" onClick={() => lab.addLayer(makeSynthLayer())}>
                      <Waves size={13} />
                    </IconButton>
                  </>
                )}
                <IconButton title="Add sample layer from file" onClick={() => picker.current?.click()}>
                  <Upload size={13} />
                </IconButton>
                <input
                  ref={picker}
                  type="file"
                  accept="audio/*"
                  hidden
                  aria-label="Lab sample file"
                  onChange={event => void loadFile(event.target.files?.[0])}
                />
              </div>
            </div>
            {lab.layers.map((item, index) => (
              <div
                key={item.id}
                className={`lab-layer ${item.id === layer?.id ? 'selected' : ''} ${item.mute ? 'muted' : ''}`}
                onClick={() => lab.set({ selectedLayerId: item.id })}
              >
                <span className="track-number">{String(index + 1).padStart(2, '0')}</span>
                <strong>
                  {item.kind === 'drum'
                    ? DRUM_LABELS[item.drum]
                    : item.kind === 'synth'
                      ? `Synth ${noteName(item.pitch)}`
                      : 'Sample'}
                </strong>
                <IconButton
                  title={item.mute ? 'Unmute layer' : 'Mute layer'}
                  onClick={event => {
                    event.stopPropagation()
                    lab.updateLayer(item.id, current => ({ ...current, mute: !current.mute }))
                  }}
                >
                  {item.mute ? <VolumeX size={12} /> : <Volume2 size={12} />}
                </IconButton>
                {lab.layers.length > 1 && (
                  <IconButton
                    title="Remove layer"
                    onClick={event => {
                      event.stopPropagation()
                      lab.removeLayer(item.id)
                    }}
                  >
                    <Trash2 size={12} />
                  </IconButton>
                )}
              </div>
            ))}
            {layer && (
              <div className="pad-parameters lab-layer-common">
                <Range
                  label="Level"
                  value={layer.gain}
                  min={0}
                  max={2}
                  onChange={value => lab.updateLayer(layer.id, current => ({ ...current, gain: value }))}
                />
                <Range
                  label="Tune"
                  value={layer.tune}
                  min={-24}
                  max={24}
                  step={1}
                  format={`${layer.tune} st`}
                  onChange={value => lab.updateLayer(layer.id, current => ({ ...current, tune: value }))}
                />
                <Range
                  label="Offset"
                  value={layer.offset}
                  min={0}
                  max={1}
                  step={0.001}
                  format={`${Math.round(layer.offset * 1000)} ms`}
                  onChange={value => lab.updateLayer(layer.id, current => ({ ...current, offset: value }))}
                />
              </div>
            )}
          </div>
          <div className="lab-editor">
            {layer?.kind === 'drum' && (
              <DrumDesigner layer={layer} onChange={next => lab.updateLayer(layer.id, () => next)} />
            )}
            {layer?.kind === 'synth' && (
              <div className="lab-synth-layer">
                <div className="pad-parameters">
                  <Range
                    label="Note"
                    value={layer.pitch}
                    min={24}
                    max={96}
                    step={1}
                    format={noteName(layer.pitch)}
                    onChange={value => lab.updateLayer(layer.id, current => ({ ...current, pitch: value }) as LabLayer)}
                  />
                  <Range
                    label="Hold"
                    value={layer.hold}
                    min={0.02}
                    max={4}
                    step={0.01}
                    format={`${layer.hold.toFixed(2)} s`}
                    onChange={value => lab.updateLayer(layer.id, current => ({ ...current, hold: value }) as LabLayer)}
                  />
                </div>
                <SynthControls
                  synth={layer.synth}
                  onChange={synth => lab.updateLayer(layer.id, current => ({ ...current, synth }) as LabLayer)}
                />
              </div>
            )}
            {layer?.kind === 'sample' && (
              <SampleLayerEditor layer={layer} onChange={next => lab.updateLayer(layer.id, () => next)} />
            )}
          </div>
          <ProcessRack />
        </div>
      )}
    </section>
  )
}

function DrumDesigner({
  layer,
  onChange,
}: {
  layer: Extract<LabLayer, { kind: 'drum' }>
  onChange: (layer: LabLayer) => void
}) {
  const set = (key: keyof DrumParams, value: number) =>
    onChange({ ...layer, params: { ...layer.params, [key]: value } })
  const p = layer.params
  return (
    <div className="drum-designer">
      <div className="section-heading">
        <h2>Drum synth</h2>
        <div className="segmented" role="group" aria-label="Drum type">
          {DRUMS.map(drum => (
            <button
              key={drum}
              className={layer.drum === drum ? 'selected' : ''}
              onClick={() => {
                onChange({ ...layer, drum, params: { ...DRUM_DEFAULTS[drum] } })
                if (useLab.getState().mode === 'drum')
                  useLab.setState({ name: `New ${DRUM_LABELS[drum].toLowerCase()}` })
              }}
            >
              {DRUM_LABELS[drum]}
            </button>
          ))}
        </div>
      </div>
      <div className="pad-parameters">
        <Range
          label="Pitch"
          context="drum"
          value={Math.log2(p.pitch)}
          min={Math.log2(20)}
          max={Math.log2(4000)}
          step={0.01}
          format={`${Math.round(p.pitch)} Hz`}
          onChange={value => set('pitch', 2 ** value)}
        />
        <Range label="Sweep" value={p.sweep} min={0} max={1} onChange={value => set('sweep', value)} />
        <Range
          label="Decay"
          context="drum"
          value={p.decay}
          min={0.01}
          max={2}
          step={0.005}
          format={`${Math.round(p.decay * 1000)} ms`}
          onChange={value => set('decay', value)}
        />
        <Range label="Click" value={p.click} min={0} max={1} onChange={value => set('click', value)} />
        <Range label="Drive" context="drum" value={p.drive} min={0} max={1} onChange={value => set('drive', value)} />
      </div>
      <div className="pad-parameters">
        <Range label="Noise" context="drum" value={p.noise} min={0} max={1} onChange={value => set('noise', value)} />
        <Range
          label="Noise decay"
          value={p.noiseDecay}
          min={0.005}
          max={1}
          step={0.005}
          format={`${Math.round(p.noiseDecay * 1000)} ms`}
          onChange={value => set('noiseDecay', value)}
        />
        <Range
          label="Tone"
          value={Math.log2(p.tone)}
          min={Math.log2(200)}
          max={Math.log2(18000)}
          step={0.01}
          format={`${Math.round(p.tone)} Hz`}
          onChange={value => set('tone', 2 ** value)}
        />
        <Range label="Character" value={p.character} min={0} max={1} onChange={value => set('character', value)} />
      </div>
    </div>
  )
}

function SampleLayerEditor({
  layer,
  onChange,
}: {
  layer: Extract<LabLayer, { kind: 'sample' }>
  onChange: (layer: LabLayer) => void
}) {
  const buffer = engine.buffers.get(layer.bufferId)
  const duration = buffer?.duration ?? 1
  const end = layer.end > layer.start ? layer.end : duration
  return (
    <div className="drum-designer">
      <div className="section-heading">
        <h2>Sample layer</h2>
        <span className="eyebrow">{buffer ? `${duration.toFixed(2)} s source` : 'audio missing'}</span>
      </div>
      <div className="pad-parameters">
        <Range
          label="Start"
          value={layer.start}
          min={0}
          max={Math.max(0.01, duration - 0.01)}
          step={0.001}
          format={`${layer.start.toFixed(3)} s`}
          onChange={value => onChange({ ...layer, start: Math.min(value, end - 0.005) })}
        />
        <Range
          label="End"
          value={end}
          min={0.01}
          max={duration}
          step={0.001}
          format={`${end.toFixed(3)} s`}
          onChange={value => onChange({ ...layer, end: Math.max(value, layer.start + 0.005) })}
        />
      </div>
      <label className="check-label">
        <input
          type="checkbox"
          checked={layer.reverse}
          onChange={event => onChange({ ...layer, reverse: event.target.checked })}
        />
        Reverse
      </label>
    </div>
  )
}

function ProcessRack() {
  const lab = useLab()
  const process = lab.process
  const setEffect = (id: string, change: (effect: EffectInstance) => EffectInstance) =>
    lab.set({
      process: { ...process, effects: process.effects.map(effect => (effect.id === id ? change(effect) : effect)) },
    })
  const param = (effect: EffectInstance, key: keyof EffectParams, value: number | string) =>
    setEffect(effect.id, current => ({ ...current, enabled: true, params: { ...current.params, [key]: value } }))
  return (
    <div className="lab-process">
      <div className="section-heading">
        <h2>Process</h2>
        <select
          aria-label="Add lab effect"
          value=""
          onChange={event =>
            event.target.value &&
            lab.set({
              process: {
                ...process,
                effects: [...process.effects, makeEffect(event.target.value as EffectType, true)],
              },
            })
          }
        >
          <option value="">+ Effect…</option>
          {(['filter', 'eq', 'compressor', 'saturation', 'bitcrush', 'chorus', 'delay', 'reverb'] as EffectType[]).map(
            type => (
              <option key={type} value={type}>
                {type}
              </option>
            ),
          )}
        </select>
      </div>
      {process.effects.map(effect => (
        <div key={effect.id} className={`lab-effect ${effect.enabled ? 'on' : ''}`}>
          <div className="lab-effect-title">
            <button
              className={`toggle ${effect.enabled ? 'on' : ''}`}
              aria-pressed={effect.enabled}
              onClick={() => setEffect(effect.id, current => ({ ...current, enabled: !current.enabled }))}
            >
              {PROCESS_LABEL[effect.type] ?? effect.type}
            </button>
            <IconButton
              title={`Remove ${effect.type}`}
              onClick={() =>
                lab.set({ process: { ...process, effects: process.effects.filter(item => item.id !== effect.id) } })
              }
            >
              <Trash2 size={11} />
            </IconButton>
          </div>
          {effect.enabled && (
            <div className="pad-parameters compact">
              {effect.type === 'eq' && (
                <>
                  <Range
                    label="Low"
                    value={effect.params.lowGain}
                    min={-18}
                    max={18}
                    step={0.5}
                    format={`${effect.params.lowGain} dB`}
                    onChange={value => param(effect, 'lowGain', value)}
                  />
                  <Range
                    label="Mid"
                    value={effect.params.midGain}
                    min={-18}
                    max={18}
                    step={0.5}
                    format={`${effect.params.midGain} dB`}
                    onChange={value => param(effect, 'midGain', value)}
                  />
                  <Range
                    label="High"
                    value={effect.params.highGain}
                    min={-18}
                    max={18}
                    step={0.5}
                    format={`${effect.params.highGain} dB`}
                    onChange={value => param(effect, 'highGain', value)}
                  />
                </>
              )}
              {effect.type === 'saturation' && (
                <Range
                  label="Drive"
                  value={effect.params.drive}
                  min={0}
                  max={1}
                  onChange={value => param(effect, 'drive', value)}
                />
              )}
              {effect.type === 'filter' && (
                <>
                  <Range
                    label="Cutoff"
                    value={Math.log2(effect.params.cutoff)}
                    min={Math.log2(30)}
                    max={Math.log2(18000)}
                    step={0.01}
                    format={`${Math.round(effect.params.cutoff)} Hz`}
                    onChange={value => param(effect, 'cutoff', 2 ** value)}
                  />
                  <Range
                    label="Reso"
                    value={effect.params.q}
                    min={0.1}
                    max={15}
                    onChange={value => param(effect, 'q', value)}
                  />
                </>
              )}
              {effect.type === 'compressor' && (
                <>
                  <Range
                    label="Thresh"
                    value={effect.params.threshold}
                    min={-60}
                    max={0}
                    step={0.5}
                    format={`${effect.params.threshold} dB`}
                    onChange={value => param(effect, 'threshold', value)}
                  />
                  <Range
                    label="Ratio"
                    value={effect.params.ratio}
                    min={1}
                    max={20}
                    step={0.1}
                    onChange={value => param(effect, 'ratio', value)}
                  />
                </>
              )}
              {effect.type === 'chorus' && (
                <Range
                  label="Rate"
                  value={effect.params.rate}
                  min={0.05}
                  max={8}
                  onChange={value => param(effect, 'rate', value)}
                />
              )}
              {effect.type === 'delay' && (
                <Range
                  label="Feedback"
                  value={effect.params.feedback}
                  min={0}
                  max={0.85}
                  onChange={value => param(effect, 'feedback', value)}
                />
              )}
              {['reverb', 'delay', 'chorus', 'saturation', 'bitcrush'].includes(effect.type) && (
                <Range
                  label="Mix"
                  value={effect.params.mix}
                  min={0}
                  max={1}
                  onChange={value => param(effect, 'mix', value)}
                />
              )}
            </div>
          )}
        </div>
      ))}
      <div className="lab-finish">
        <label className="check-label">
          <input
            type="checkbox"
            checked={process.normalize}
            onChange={event => lab.set({ process: { ...process, normalize: event.target.checked } })}
          />
          Normalize
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={process.trimSilence}
            onChange={event => lab.set({ process: { ...process, trimSilence: event.target.checked } })}
          />
          Trim silence
        </label>
        <Range
          label="Tail"
          value={process.tail}
          min={0}
          max={4}
          step={0.05}
          format={`${process.tail.toFixed(2)} s`}
          onChange={value => lab.set({ process: { ...process, tail: value } })}
        />
        <Range
          label="Fade out"
          value={process.fadeOut}
          min={0}
          max={1}
          step={0.005}
          format={`${Math.round(process.fadeOut * 1000)} ms`}
          onChange={value => lab.set({ process: { ...process, fadeOut: value } })}
        />
      </div>
    </div>
  )
}

/** Synth patch designer with a playable keyboard for audition. */
function SynthDesigner({ synth, onChange }: { synth: SynthParams; onChange: (synth: SynthParams) => void }) {
  const [octave, setOctave] = useState(3)
  const held = useRef(new Map<number, ReturnType<typeof synthVoice>>())
  const start = async (pitch: number) => {
    await engine.ready()
    const context = engine.context!
    held.current.get(pitch)?.release(context.currentTime)
    const voice = synthVoice(context, synth, pitch, context.currentTime + 0.005, 0.9, Infinity)
    voice.output.connect(engine.graph!.masterIn)
    held.current.set(pitch, voice)
  }
  const end = (pitch: number) => {
    const voice = held.current.get(pitch)
    if (!voice || !engine.context) return
    voice.release(engine.context.currentTime)
    held.current.delete(pitch)
  }
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (
        (event.target as HTMLElement).closest('input, select, textarea') ||
        event.repeat ||
        event.metaKey ||
        event.ctrlKey
      )
        return
      const key = event.key.toLowerCase()
      if (key in PIANO_KEYS) {
        event.preventDefault()
        event.stopPropagation()
        void start(octave * 12 + 12 + PIANO_KEYS[key])
      }
    }
    const up = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (key in PIANO_KEYS) end(octave * 12 + 12 + PIANO_KEYS[key])
    }
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    return () => {
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up, true)
    }
  })
  const pitches = Array.from({ length: 25 }, (_, index) => octave * 12 + 12 + index)
  const whites = pitches.filter(pitch => !isBlackKey(pitch))
  return (
    <div className="lab-layout synth-mode">
      <div className="synth-section">
        <div className="section-heading">
          <h2>
            <Waves size={15} />
            Patch
          </h2>
        </div>
        <SynthControls synth={synth} onChange={onChange} />
      </div>
      <div className="pads-section keyboard-section">
        <div className="section-heading">
          <h2>Audition</h2>
          <div className="inline-actions">
            <button onClick={() => setOctave(Math.max(0, octave - 1))} aria-label="Lab octave down">
              -
            </button>
            <span className="tag">C{octave}</span>
            <button onClick={() => setOctave(Math.min(7, octave + 1))} aria-label="Lab octave up">
              +
            </button>
          </div>
        </div>
        <div className="piano-keyboard">
          {whites.map(pitch => (
            <button
              key={pitch}
              className="white-key"
              aria-label={`Lab key ${noteName(pitch)}`}
              onPointerDown={event => {
                event.preventDefault()
                void start(pitch)
              }}
              onPointerUp={() => end(pitch)}
              onPointerLeave={() => end(pitch)}
            >
              <small>{noteName(pitch)}</small>
            </button>
          ))}
          {pitches.filter(isBlackKey).map(pitch => {
            const whiteIndex = whites.filter(white => white < pitch).length
            return (
              <button
                key={pitch}
                className="black-key"
                style={{ left: `calc(${(whiteIndex / whites.length) * 100}% - 1.6%)` }}
                aria-label={`Lab key ${noteName(pitch)}`}
                onPointerDown={event => {
                  event.preventDefault()
                  void start(pitch)
                }}
                onPointerUp={() => end(pitch)}
                onPointerLeave={() => end(pitch)}
              />
            )
          })}
        </div>
        <div className="section-foot">
          <span>A–L white keys, W–P sharps</span>
          <span>Save to library to use this patch on any synth track</span>
        </div>
      </div>
    </div>
  )
}
