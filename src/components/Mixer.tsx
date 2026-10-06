import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Mic, Plus, Trash2, Headphones } from 'lucide-react'
import { engine } from '../audio/engine'
import { useStudio } from '../state/store'
import { addTrack, moveTrack, removeTrack, selectTrack } from '../state/actions'
import { TRACK_COLORS } from '../state/defaults'
import type { TrackKind } from '../state/types'
import { IconButton } from './Controls'

const KIND_LABEL: Record<TrackKind, string> = {
  drums: 'DRUMS',
  keys: 'KEYS',
  synth: 'SYNTH',
  audio: 'AUDIO',
  bus: 'BUS',
}

export function Mixer() {
  const { project, selectedTrackId, edit, inputArmed } = useStudio()
  const [levels, setLevels] = useState<Map<string, number>>(new Map())
  const [showAdd, setShowAdd] = useState(false)
  useEffect(() => {
    let frame = 0
    let last = 0
    const tick = (now: number) => {
      if (now - last > 50) {
        setLevels(engine.levels())
        last = now
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])
  const buses = project.tracks.filter(track => track.kind === 'bus')
  const toDb = (value: number) => Math.max(0, Math.min(1, (20 * Math.log10(value || 0.00001) + 60) / 60))
  return (
    <section className="mixer-section">
      <div className="section-heading">
        <h2>Mixer</h2>
        <div className="inline-actions">
          <span>{project.tracks.length} CHANNELS</span>
          <div className="export-container">
            <button onClick={() => setShowAdd(!showAdd)} aria-expanded={showAdd}>
              <Plus size={13} />
              Add track
            </button>
            {showAdd && (
              <div className="export-menu" role="menu">
                {(['drums', 'keys', 'synth', 'audio', 'bus'] as TrackKind[]).map(kind => (
                  <button
                    key={kind}
                    role="menuitem"
                    onClick={() => {
                      addTrack(kind)
                      setShowAdd(false)
                    }}
                  >
                    {kind === 'drums'
                      ? 'Drum sampler'
                      : kind === 'keys'
                        ? 'Pitched sampler'
                        : kind === 'synth'
                          ? 'Synthesizer'
                          : kind === 'audio'
                            ? 'Audio track'
                            : 'Bus (group / send)'}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="mixer-channels">
        {project.tracks.map((track, index) => {
          const level = toDb(levels.get(track.id) ?? 0)
          return (
            <div
              className={`channel ${selectedTrackId === track.id ? 'selected' : ''} kind-${track.kind}`}
              key={track.id}
              style={{ '--track-color': track.color } as React.CSSProperties}
            >
              <button className="channel-name" onClick={() => selectTrack(track)}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <input
                  aria-label={`${track.name} name`}
                  value={track.name}
                  maxLength={20}
                  onClick={event => event.stopPropagation()}
                  onChange={event =>
                    edit(
                      'Track name',
                      draft => {
                        draft.tracks[index].name = event.target.value
                      },
                      `${track.id}-name`,
                    )
                  }
                />
                <small>{KIND_LABEL[track.kind]}</small>
              </button>
              <div className="channel-switches">
                <button
                  aria-label={`Mute ${track.name}`}
                  aria-pressed={track.mute}
                  onClick={() =>
                    edit('Mute', draft => {
                      draft.tracks[index].mute = !track.mute
                    })
                  }
                >
                  M
                </button>
                <button
                  aria-label={`Solo ${track.name}`}
                  aria-pressed={track.solo}
                  onClick={() =>
                    edit('Solo', draft => {
                      draft.tracks[index].solo = !track.solo
                    })
                  }
                >
                  S
                </button>
                {track.kind === 'audio' && (
                  <button
                    aria-label={`Monitor ${track.name}`}
                    aria-pressed={Boolean(track.monitor)}
                    title="Monitor input"
                    onClick={() => {
                      edit('Monitor', draft => {
                        draft.tracks[index].monitor = !track.monitor
                      })
                      engine.recorder?.setMonitor(!track.monitor)
                    }}
                  >
                    <Headphones size={11} />
                  </button>
                )}
              </div>
              <div className="fader-area">
                <span className="fader-scale">
                  +6
                  <br />0<br />
                  -12
                  <br />
                  -24
                  <br />
                  -inf
                </span>
                <div className="channel-meter" aria-hidden="true">
                  <i style={{ height: `${level * 100}%`, background: level > 0.92 ? '#c4583a' : undefined }} />
                </div>
                <input
                  className="fader"
                  aria-label={`${track.name} volume`}
                  type="range"
                  min="0"
                  max="1.5"
                  step="0.01"
                  value={track.volume}
                  onChange={event =>
                    edit(
                      'Track volume',
                      draft => {
                        draft.tracks[index].volume = Number(event.target.value)
                      },
                      `${track.id}-volume`,
                    )
                  }
                />
              </div>
              <output className="db-value">
                {track.volume === 0 ? '-inf' : (20 * Math.log10(track.volume)).toFixed(1)} dB
              </output>
              <label className="pan-control">
                <span>
                  L <b>PAN</b> R
                </span>
                <input
                  aria-label={`${track.name} pan`}
                  type="range"
                  min="-1"
                  max="1"
                  step="0.01"
                  value={track.pan}
                  onChange={event =>
                    edit(
                      'Track pan',
                      draft => {
                        draft.tracks[index].pan = Number(event.target.value)
                      },
                      `${track.id}-pan`,
                    )
                  }
                />
              </label>
              <div className="channel-inserts">
                {track.effects.slice(0, 2).map((effect, effectIndex) => (
                  <button
                    key={effect.id}
                    aria-label={`${track.name} ${effect.type} insert`}
                    aria-pressed={effect.enabled}
                    onClick={() =>
                      edit('Toggle insert', draft => {
                        draft.tracks[index].effects[effectIndex].enabled = !effect.enabled
                      })
                    }
                  >
                    <i />
                    {effect.type.slice(0, 3).toUpperCase()}
                  </button>
                ))}
              </div>
              {track.kind !== 'bus' && buses.length > 0 && (
                <div className="channel-sends">
                  {buses.map(bus => {
                    const send = track.sends.find(item => item.busId === bus.id)
                    return (
                      <label key={bus.id} title={`Send to ${bus.name}`}>
                        <span>{bus.name.slice(0, 6)}</span>
                        <input
                          aria-label={`${track.name} send to ${bus.name}`}
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={send?.level ?? 0}
                          onChange={event =>
                            edit(
                              'Send level',
                              draft => {
                                const target = draft.tracks[index]
                                const existing = target.sends.find(item => item.busId === bus.id)
                                const value = Number(event.target.value)
                                if (existing) existing.level = value
                                else target.sends.push({ busId: bus.id, level: value })
                              },
                              `${track.id}-send-${bus.id}`,
                            )
                          }
                        />
                      </label>
                    )
                  })}
                  <select
                    aria-label={`${track.name} output`}
                    value={track.outputBusId ?? ''}
                    onChange={event =>
                      edit('Track output', draft => {
                        if (event.target.value) draft.tracks[index].outputBusId = event.target.value
                        else delete draft.tracks[index].outputBusId
                      })
                    }
                  >
                    <option value="">→ Master</option>
                    {buses.map(bus => (
                      <option key={bus.id} value={bus.id}>
                        → {bus.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="channel-footer">
                <input
                  type="color"
                  aria-label={`${track.name} color`}
                  value={track.color}
                  list="track-colors"
                  onChange={event =>
                    edit(
                      'Track color',
                      draft => {
                        draft.tracks[index].color = event.target.value
                      },
                      `${track.id}-color`,
                    )
                  }
                />
                <IconButton title="Move track left" disabled={index === 0} onClick={() => moveTrack(track.id, -1)}>
                  <ArrowLeft size={12} />
                </IconButton>
                <IconButton
                  title="Move track right"
                  disabled={index === project.tracks.length - 1}
                  onClick={() => moveTrack(track.id, 1)}
                >
                  <ArrowRight size={12} />
                </IconButton>
                <IconButton
                  title={`Remove ${track.name}`}
                  disabled={project.tracks.length <= 1}
                  onClick={() => {
                    if (confirm(`Remove track "${track.name}" and its clips?`)) removeTrack(track.id)
                  }}
                >
                  <Trash2 size={12} />
                </IconButton>
                {track.kind === 'audio' && selectedTrackId === track.id && inputArmed && (
                  <Mic size={12} className="armed-icon" aria-label="Input armed" />
                )}
              </div>
            </div>
          )
        })}
        <datalist id="track-colors">
          {TRACK_COLORS.map(color => (
            <option key={color} value={color} />
          ))}
        </datalist>
      </div>
    </section>
  )
}
