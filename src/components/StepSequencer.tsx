import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Copy, Dices, Plus, Shuffle, Sparkles, Trash2, Wand2, X } from 'lucide-react'
import { notify, useStudio } from '../state/store'
import { createPattern, deletePattern, selectTrack, setPatternBars, setSwing, stop } from '../state/actions'
import { stepsPerBar } from '../state/defaults'
import {
  applyGroove,
  densityHits,
  DRUM_PRESETS,
  DRUM_ROLES,
  fillHits,
  GENRES,
  GROOVES,
  hitsToSteps,
  humanize,
  presetHits,
  roleFromName,
  type DrumRole,
  type GrooveName,
  type Hit,
} from '../state/generate'
import { IconButton, Range } from './Controls'

export function StepSequencer() {
  const { project, patternId, selectedTrackId, playhead, playing, edit } = useStudio()
  const pattern = project.patterns.find(item => item.id === patternId) ?? project.patterns[0]
  const perBar = stepsPerBar(project)
  const [page, setPage] = useState(0)
  const [detail, setDetail] = useState<{ trackId: string; index: number } | null>(null)
  const press = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const longPressed = useRef(false)
  const bars = pattern.bars
  const currentPage = Math.min(page, bars - 1)
  const offset = currentPage * perBar
  const step = detail ? pattern.trackSteps.find(row => row.trackId === detail.trackId)?.steps[detail.index] : undefined
  const playingBar = playhead >= 0 ? Math.floor(playhead / perBar) : -1
  const rows = pattern.trackSteps.filter(row => {
    const track = project.tracks.find(item => item.id === row.trackId)
    return track && track.kind !== 'audio' && track.kind !== 'bus'
  })
  // ---- generators: act on the selected track's row (its sequencer pad for kits) ----
  const [genre, setGenre] = useState(GENRES[0])
  const [role, setRole] = useState<DrumRole | 'auto'>('auto')
  const [density, setDensity] = useState(0.5)
  const [groove, setGroove] = useState<GrooveName>('mpc60')
  const [humanizeAmount, setHumanizeAmount] = useState(0.4)
  const [seed, setSeed] = useState(1)
  const selected = project.tracks.find(item => item.id === selectedTrackId)
  const targetPad =
    selected?.kind === 'drums' ? selected.pads.find(pad => pad.id === selected.sequencerPadId) : undefined
  const resolvedRole: DrumRole = role === 'auto' ? roleFromName(targetPad?.name ?? selected?.name) : role
  const canGenerate = Boolean(selected && selected.kind !== 'audio' && selected.kind !== 'bus')
  const writeHits = (label: string, hits: Hit[]) => {
    if (!selected) return
    edit(label, draft => {
      const row = draft.patterns
        .find(item => item.id === pattern.id)
        ?.trackSteps.find(item => item.trackId === selected.id)
      if (!row) return
      row.steps = hitsToSteps(hits, row.steps, selected.kind === 'drums' ? selected.sequencerPadId : undefined)
    })
  }
  const currentHits = (): Hit[] => {
    const row = pattern.trackSteps.find(item => item.trackId === selected?.id)
    const padId = selected?.kind === 'drums' ? selected.sequencerPadId : undefined
    return (row?.steps ?? []).flatMap((step, index) =>
      step.active && (padId === undefined || (step.padId ?? '') === padId)
        ? [{ step: index, velocity: step.velocity }]
        : [],
    )
  }
  const generatePreset = () => {
    writeHits(`Preset ${DRUM_PRESETS[genre].label} ${resolvedRole}`, presetHits(genre, resolvedRole, bars, perBar))
    notify(`${DRUM_PRESETS[genre].label} ${resolvedRole} pattern on ${selected?.name}. Try Random or Fill next.`)
  }
  const generateRandom = () => {
    const next = seed + 1
    setSeed(next)
    writeHits(`Random ${resolvedRole}`, densityHits(resolvedRole, density, bars, next, perBar))
  }
  const generateFill = () => {
    const next = seed + 1
    setSeed(next)
    writeHits('Fill', fillHits(currentHits(), resolvedRole, bars, next, perBar))
  }
  const applyPatternGroove = () => {
    edit(`Groove ${GROOVES[groove].label}`, draft => {
      const target = draft.patterns.find(item => item.id === pattern.id)
      if (!target) return
      for (const row of target.trackSteps) row.steps = applyGroove(row.steps, groove, perBar)
    })
    setSwing(GROOVES[groove].swing)
    notify(
      `${GROOVES[groove].label} applied to "${pattern.name}" and the swing set to ${Math.round(GROOVES[groove].swing * 100)}%.`,
    )
  }
  const applyHumanize = () => {
    const next = seed + 1
    setSeed(next)
    edit('Humanize', draft => {
      const target = draft.patterns.find(item => item.id === pattern.id)
      if (!target) return
      target.trackSteps.forEach((row, index) => {
        row.steps = humanize(row.steps, humanizeAmount, next * 31 + index)
      })
    })
  }
  return (
    <section className="sequencer-section">
      <div className="section-heading">
        <h2>
          Step sequencer <span className="tag">{perBar} STEPS / BAR</span>
        </h2>
        <div className="inline-actions">
          <select
            aria-label="Pattern"
            value={pattern.id}
            onChange={event => {
              stop()
              useStudio.setState({ patternId: event.target.value })
            }}
          >
            {project.patterns.map(item => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <input
            aria-label="Pattern name"
            className="pattern-name"
            value={pattern.name}
            maxLength={24}
            onChange={event =>
              edit(
                'Pattern name',
                draft => {
                  draft.patterns.find(item => item.id === pattern.id)!.name = event.target.value
                },
                `pattern-name-${pattern.id}`,
              )
            }
          />
          <label>
            Bars
            <select
              aria-label="Pattern bars"
              value={bars}
              onChange={event => setPatternBars(pattern.id, Number(event.target.value))}
            >
              {[1, 2, 4, 8, 16].map(count => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </label>
          <IconButton title="Duplicate pattern" onClick={() => createPattern(pattern.id)}>
            <Copy size={14} />
          </IconButton>
          <IconButton title="New pattern" onClick={() => createPattern()}>
            <Plus size={16} />
          </IconButton>
          <IconButton
            title="Delete pattern"
            disabled={project.patterns.length <= 1}
            onClick={() => deletePattern(pattern.id)}
          >
            <Trash2 size={14} />
          </IconButton>
        </div>
      </div>
      <div className="sequencer-tools" aria-label="Pattern generators">
        <span className="eyebrow">
          <Sparkles size={11} /> GENERATE {selected ? `ON ${selected.name.toUpperCase()}` : ''}
          {targetPad ? ` / ${(targetPad.name ?? 'PAD').toUpperCase()}` : ''}
        </span>
        <select aria-label="Preset genre" value={genre} onChange={event => setGenre(event.target.value)}>
          {GENRES.map(item => (
            <option key={item} value={item}>
              {DRUM_PRESETS[item].label}
            </option>
          ))}
        </select>
        <select
          aria-label="Drum role"
          value={role}
          onChange={event => setRole(event.target.value as DrumRole | 'auto')}
        >
          <option value="auto">Auto ({resolvedRole})</option>
          {DRUM_ROLES.map(item => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <button disabled={!canGenerate} onClick={generatePreset} title="Write the genre preset for this role">
          <Wand2 size={12} />
          Preset
        </button>
        <label className="density">
          Density
          <input
            aria-label="Generator density"
            type="range"
            min="0.1"
            max="1"
            step="0.05"
            value={density}
            onChange={event => setDensity(Number(event.target.value))}
          />
        </label>
        <button disabled={!canGenerate} onClick={generateRandom} title="A new musical random pattern each press">
          <Dices size={12} />
          Random
        </button>
        <button disabled={!canGenerate} onClick={generateFill} title="Replace the end of the pattern with a fill">
          Fill
        </button>
        <span className="tools-divider" />
        <select aria-label="Groove" value={groove} onChange={event => setGroove(event.target.value as GrooveName)}>
          {(Object.keys(GROOVES) as GrooveName[]).map(item => (
            <option key={item} value={item}>
              {GROOVES[item].label}
            </option>
          ))}
        </select>
        <button onClick={applyPatternGroove} title="Timing and accents for every row, plus the matching swing">
          <Shuffle size={12} />
          Groove
        </button>
        <label className="density">
          Human
          <input
            aria-label="Humanize amount"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={humanizeAmount}
            onChange={event => setHumanizeAmount(Number(event.target.value))}
          />
        </label>
        <button onClick={applyHumanize} title="Random velocity and timing jitter on every row">
          Humanize
        </button>
      </div>
      {bars > 1 && (
        <div className="bar-pager">
          <IconButton title="Previous bar" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
            <ChevronLeft size={14} />
          </IconButton>
          {Array.from({ length: bars }, (_, index) => (
            <button
              key={index}
              className={`${index === currentPage ? 'selected' : ''} ${index === playingBar ? 'playing' : ''}`}
              onClick={() => setPage(index)}
              aria-label={`Bar ${index + 1}`}
              aria-pressed={index === currentPage}
            >
              {String(index + 1).padStart(2, '0')}
            </button>
          ))}
          <IconButton title="Next bar" disabled={currentPage >= bars - 1} onClick={() => setPage(currentPage + 1)}>
            <ChevronRight size={14} />
          </IconButton>
          <button className="follow" onClick={() => playingBar >= 0 && setPage(playingBar)} disabled={playingBar < 0}>
            Follow
          </button>
        </div>
      )}
      <div className="sequencer-scroll">
        <div className="sequencer-grid" style={{ '--steps': perBar } as React.CSSProperties}>
          <div className="step-ruler">
            <span>TRACK / PAD</span>
            {Array.from({ length: perBar }, (_, index) => (
              <span key={index} className={index % 4 === 0 ? 'beat-number' : ''}>
                {String(offset + index + 1).padStart(2, '0')}
              </span>
            ))}
          </div>
          {rows.map(row => {
            const track = project.tracks.find(item => item.id === row.trackId)!
            const rowIndex = project.tracks.indexOf(track)
            return (
              <div
                className={`step-row ${selectedTrackId === track.id ? 'selected-track' : ''}`}
                key={row.trackId}
                style={{ '--track-color': track.color } as React.CSSProperties}
              >
                <div className="step-track">
                  <button onClick={() => selectTrack(track)}>
                    <span className="track-number">{String(rowIndex + 1).padStart(2, '0')}</span>
                    <strong>{track.name}</strong>
                  </button>
                  {track.kind === 'drums' ? (
                    <select
                      aria-label={`${track.name} sequencer pad`}
                      value={track.sequencerPadId}
                      onChange={event =>
                        edit('Sequencer pad', draft => {
                          draft.tracks.find(item => item.id === track.id)!.sequencerPadId = event.target.value
                        })
                      }
                    >
                      {track.pads.map((pad, index) => (
                        <option key={pad.id} value={pad.id}>
                          P{String(index + 1).padStart(2, '0')}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="eyebrow">{track.kind === 'synth' ? 'SYNTH' : 'KEYS'}</span>
                  )}
                </div>
                {Array.from({ length: perBar }, (_, column) => {
                  const index = offset + column
                  const item = row.steps[index] ?? { active: false, velocity: 1, microTimingMs: 0 }
                  return (
                    <button
                      aria-label={`${track.name} step ${index + 1}`}
                      aria-pressed={item.active}
                      key={index}
                      className={`step-cell ${item.active ? 'active' : ''} ${column % 4 === 0 ? 'beat-start' : ''} ${playing && playhead === index ? 'playhead' : ''}`}
                      style={{ '--velocity': item.velocity } as React.CSSProperties}
                      onClick={() => {
                        if (longPressed.current) {
                          longPressed.current = false
                          return
                        }
                        edit('Toggle step', draft => {
                          const target = draft.patterns
                            .find(value => value.id === pattern.id)!
                            .trackSteps.find(r => r.trackId === row.trackId)!.steps[index]
                          if (target) target.active = !target.active
                        })
                      }}
                      onContextMenu={event => {
                        event.preventDefault()
                        setDetail({ trackId: track.id, index })
                      }}
                      onPointerDown={() => {
                        longPressed.current = false
                        press.current = setTimeout(() => {
                          longPressed.current = true
                          setDetail({ trackId: track.id, index })
                        }, 450)
                      }}
                      onPointerUp={() => clearTimeout(press.current)}
                      onPointerLeave={() => clearTimeout(press.current)}
                      onPointerCancel={() => clearTimeout(press.current)}
                    >
                      <span />
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
      {detail && step && (
        <div className="step-detail">
          <strong>Step {detail.index + 1}</strong>
          <Range
            label="Velocity"
            value={step.velocity}
            min={0.05}
            max={1}
            format={`${Math.round(step.velocity * 100)}%`}
            onChange={value =>
              edit(
                'Step velocity',
                draft => {
                  draft.patterns
                    .find(item => item.id === pattern.id)!
                    .trackSteps.find(row => row.trackId === detail.trackId)!.steps[detail.index].velocity = value
                },
                'velocity',
              )
            }
          />
          <Range
            label="Microtiming"
            value={step.microTimingMs}
            min={-50}
            max={50}
            step={1}
            format={`${step.microTimingMs} ms`}
            onChange={value =>
              edit(
                'Step timing',
                draft => {
                  draft.patterns
                    .find(item => item.id === pattern.id)!
                    .trackSteps.find(row => row.trackId === detail.trackId)!.steps[detail.index].microTimingMs = value
                },
                'microtiming',
              )
            }
          />
          <IconButton title="Close step editor" onClick={() => setDetail(null)}>
            <X size={16} />
          </IconButton>
        </div>
      )}
      <div className="section-foot">
        <span>
          {bars} BAR{bars > 1 ? 'S' : ''} <b>/</b> 1/16 RESOLUTION <b>/</b> {project.timeSignature.beats}/4
        </span>
        <span>
          {pattern.trackSteps.reduce((sum, row) => sum + row.steps.filter(item => item.active).length, 0)} ACTIVE STEPS
        </span>
      </div>
    </section>
  )
}
