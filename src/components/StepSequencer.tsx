import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Copy, Plus, Trash2, X } from 'lucide-react'
import { useStudio } from '../state/store'
import { createPattern, deletePattern, selectTrack, setPatternBars, stop } from '../state/actions'
import { stepsPerBar } from '../state/defaults'
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
