import { useEffect, useRef, useState } from 'react'
import { Copy, Magnet, Minus, Plus, Repeat, Scissors, Trash2, VolumeX, Volume2, X } from 'lucide-react'
import { useStudio } from '../state/store'
import { addClip, addLane, deleteClip, play, removeLane, seek, selectClip, setLoopRegion, stop } from '../state/actions'
import {
  arrangementEnd,
  beatsPerBar,
  duplicateClip,
  moveClip,
  resizeClip,
  snapBeat,
  splitClip,
} from '../state/arrangement'
import { describeTarget } from '../state/automation'
import type { Clip } from '../state/types'
import { IconButton } from './Controls'

type Drag = {
  kind: 'move' | 'resize' | 'loop-start' | 'loop-end' | 'loop-new'
  clipId?: string
  originX: number
  originBeat: number
  laneId?: string
  startBeat?: number
}

export function Timeline() {
  const { project, zoom, selectedClipId, selectedLaneId, positionBeats, playing, songMode, edit, ready, patternId } =
    useStudio()
  const [drag, setDrag] = useState<Drag | null>(null)
  const [snap, setSnap] = useState(true)
  const scroller = useRef<HTMLDivElement>(null)
  const bar = beatsPerBar(project)
  const grid = snap ? (zoom >= 48 ? 0.25 : zoom >= 24 ? 1 : bar) : 0
  const end = Math.max(arrangementEnd(project) + bar * 4, project.loop.end + bar)
  const bars = Math.ceil(end / bar)
  const width = end * zoom
  const x = (beat: number) => beat * zoom
  const beatAt = (clientX: number) => {
    const element = scroller.current
    if (!element) return 0
    const bounds = element.getBoundingClientRect()
    return Math.max(0, (clientX - bounds.left + element.scrollLeft - 160) / zoom)
  }
  useEffect(() => {
    if (!drag) return
    const move = (event: PointerEvent) => {
      const delta = (event.clientX - drag.originX) / zoom
      if (drag.kind === 'move' && drag.clipId) {
        const start = snapBeat(drag.originBeat + delta, grid)
        const laneElement = document
          .elementsFromPoint(event.clientX, event.clientY)
          .find(node => (node as HTMLElement).dataset?.laneId) as HTMLElement | undefined
        edit(
          'Move clip',
          draft => moveClip(draft, drag.clipId!, start, laneElement?.dataset.laneId),
          `move-${drag.clipId}`,
        )
      } else if (drag.kind === 'resize' && drag.clipId) {
        edit(
          'Resize clip',
          draft => resizeClip(draft, drag.clipId!, Math.max(grid || 0.25, snapBeat(drag.originBeat + delta, grid))),
          `resize-${drag.clipId}`,
        )
      } else if (drag.kind === 'loop-start')
        setLoopRegion({ start: Math.max(0, snapBeat(drag.originBeat + delta, grid || 0.25)) })
      else if (drag.kind === 'loop-end')
        setLoopRegion({ end: Math.max(0.25, snapBeat(drag.originBeat + delta, grid || 0.25)) })
      else if (drag.kind === 'loop-new') {
        const a = snapBeat(drag.originBeat, grid || 0.25)
        const b = snapBeat(drag.originBeat + delta, grid || 0.25)
        if (Math.abs(b - a) >= 0.25) setLoopRegion({ enabled: true, start: Math.min(a, b), end: Math.max(a, b) })
      }
    }
    const up = () => setDrag(null)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [drag, zoom, grid, edit])

  const selected = project.clips.find(clip => clip.id === selectedClipId)
  const clipLabel = (clip: Clip) =>
    clip.kind === 'pattern'
      ? (project.patterns.find(item => item.id === clip.patternId)?.name ?? 'Pattern')
      : clip.kind === 'automation'
        ? describeTarget(project, clip.target)
        : (project.tracks.find(item => item.id === clip.trackId)?.name ?? clip.kind)
  const clipColor = (clip: Clip) =>
    clip.color ??
    (clip.kind === 'pattern'
      ? '#b9c86d'
      : clip.kind === 'automation'
        ? '#d9a441'
        : (project.tracks.find(item => item.id === clip.trackId)?.color ?? '#8abb43'))

  return (
    <section className="timeline-section arrangement" aria-label="Arrangement timeline">
      <div className="section-heading">
        <h2>
          Arrangement <span className="tag">{Math.ceil(arrangementEnd(project) / bar)} BARS</span>
        </h2>
        <div className="inline-actions">
          <button
            className={`toggle ${project.loop.enabled ? 'on' : ''}`}
            aria-pressed={project.loop.enabled}
            onClick={() => setLoopRegion({ enabled: !project.loop.enabled })}
            title="Loop region"
          >
            <Repeat size={13} />
            Loop
          </button>
          <button
            className={`toggle ${snap ? 'on' : ''}`}
            aria-pressed={snap}
            onClick={() => setSnap(!snap)}
            title="Snap to grid"
          >
            <Magnet size={13} />
            Snap
          </button>
          <IconButton title="Zoom out timeline" onClick={() => useStudio.setState({ zoom: Math.max(6, zoom / 1.5) })}>
            <Minus size={14} />
          </IconButton>
          <IconButton title="Zoom in timeline" onClick={() => useStudio.setState({ zoom: Math.min(160, zoom * 1.5) })}>
            <Plus size={14} />
          </IconButton>
          <button
            disabled={!project.clips.length || !ready}
            onClick={() => (playing && songMode ? stop() : void play(true))}
          >
            {playing && songMode ? 'Stop song' : 'Play song'}
          </button>
          <IconButton title="Add lane" onClick={() => addLane()}>
            <Plus size={16} />
          </IconButton>
        </div>
      </div>
      <div className="timeline-scroll" ref={scroller}>
        <div className="timeline-canvas" style={{ width: width + 160 }}>
          <div className="timeline-head">
            <div className="lane-label ruler-label">BAR</div>
            <div
              className="ruler"
              style={{ width }}
              onPointerDown={event => {
                if (event.shiftKey)
                  setDrag({ kind: 'loop-new', originX: event.clientX, originBeat: beatAt(event.clientX) })
                else seek(snapBeat(beatAt(event.clientX), grid || 0.25))
              }}
              title="Click to move the playhead. Shift-drag to set a loop."
            >
              {Array.from({ length: bars }, (_, index) => (
                <span key={index} className="ruler-bar" style={{ left: x(index * bar), width: x(bar) }}>
                  {String(index + 1).padStart(2, '0')}
                </span>
              ))}
              {project.loop.enabled && (
                <div
                  className="loop-region"
                  style={{ left: x(project.loop.start), width: x(project.loop.end - project.loop.start) }}
                >
                  <i
                    className="loop-handle"
                    onPointerDown={event => {
                      event.stopPropagation()
                      setDrag({ kind: 'loop-start', originX: event.clientX, originBeat: project.loop.start })
                    }}
                  />
                  <i
                    className="loop-handle end"
                    onPointerDown={event => {
                      event.stopPropagation()
                      setDrag({ kind: 'loop-end', originX: event.clientX, originBeat: project.loop.end })
                    }}
                  />
                </div>
              )}
            </div>
          </div>
          {project.lanes.map(lane => (
            <div className={`lane ${lane.id === selectedLaneId ? 'selected' : ''}`} key={lane.id}>
              <div className="lane-label" onClick={() => useStudio.setState({ selectedLaneId: lane.id })}>
                <input
                  aria-label="Lane name"
                  value={lane.name}
                  maxLength={24}
                  onChange={event =>
                    edit(
                      'Lane name',
                      draft => {
                        draft.lanes.find(item => item.id === lane.id)!.name = event.target.value
                      },
                      `lane-${lane.id}`,
                    )
                  }
                />
                {project.lanes.length > 1 && (
                  <IconButton title="Remove lane" onClick={() => removeLane(lane.id)}>
                    <X size={12} />
                  </IconButton>
                )}
              </div>
              <div
                className="lane-body"
                data-lane-id={lane.id}
                style={{ width }}
                onDoubleClick={event => {
                  const beat = snapBeat(beatAt(event.clientX), grid || bar)
                  addClip('pattern', lane.id, beat, { patternId })
                }}
                onClick={event => {
                  if (event.target === event.currentTarget) {
                    useStudio.setState({ selectedLaneId: lane.id })
                    selectClip(undefined)
                  }
                }}
              >
                {Array.from({ length: bars }, (_, index) => (
                  <i key={index} className="bar-line" style={{ left: x(index * bar) }} />
                ))}
                {project.clips
                  .filter(clip => clip.laneId === lane.id)
                  .map(clip => (
                    <div
                      key={clip.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`${clip.name} clip`}
                      aria-pressed={clip.id === selectedClipId}
                      className={`clip clip-${clip.kind} ${clip.id === selectedClipId ? 'selected' : ''} ${clip.muted ? 'muted' : ''}`}
                      style={
                        {
                          left: x(clip.start),
                          width: Math.max(8, x(clip.length)),
                          '--clip-color': clipColor(clip),
                        } as React.CSSProperties
                      }
                      onPointerDown={event => {
                        if ((event.target as HTMLElement).classList.contains('clip-resize')) return
                        selectClip(clip)
                        setDrag({ kind: 'move', clipId: clip.id, originX: event.clientX, originBeat: clip.start })
                      }}
                      onKeyDown={event => {
                        if (event.key === 'Delete' || event.key === 'Backspace') deleteClip(clip.id)
                      }}
                    >
                      <strong>{clip.name}</strong>
                      <small>{clipLabel(clip)}</small>
                      <ClipPreview clip={clip} />
                      <i
                        className="clip-resize"
                        onPointerDown={event => {
                          event.stopPropagation()
                          selectClip(clip)
                          setDrag({ kind: 'resize', clipId: clip.id, originX: event.clientX, originBeat: clip.length })
                        }}
                      />
                    </div>
                  ))}
              </div>
            </div>
          ))}
          {positionBeats >= 0 && <div className="playhead-line" style={{ left: 160 + x(positionBeats) }} />}
        </div>
      </div>
      {selected && (
        <div className="section-editor clip-editor">
          <input
            aria-label="Clip name"
            value={selected.name}
            maxLength={32}
            onChange={event =>
              edit(
                'Clip name',
                draft => {
                  draft.clips.find(item => item.id === selected.id)!.name = event.target.value
                },
                `clip-name-${selected.id}`,
              )
            }
          />
          {selected.kind === 'pattern' && (
            <select
              aria-label="Clip pattern"
              value={selected.patternId}
              onChange={event =>
                edit('Clip pattern', draft => {
                  const clip = draft.clips.find(item => item.id === selected.id)
                  if (clip?.kind === 'pattern') clip.patternId = event.target.value
                })
              }
            >
              {project.patterns.map(item => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          )}
          <label>
            Start
            <input
              aria-label="Clip start"
              type="number"
              step={0.25}
              min={0}
              value={selected.start}
              onChange={event =>
                edit('Clip start', draft => moveClip(draft, selected.id, Number(event.target.value) || 0))
              }
            />
          </label>
          <label>
            Length
            <input
              aria-label="Clip length"
              type="number"
              step={0.25}
              min={0.25}
              value={selected.length}
              onChange={event =>
                edit('Clip length', draft => resizeClip(draft, selected.id, Number(event.target.value) || 0.25))
              }
            />
          </label>
          <IconButton
            title={selected.muted ? 'Unmute clip' : 'Mute clip'}
            aria-pressed={selected.muted}
            onClick={() =>
              edit('Mute clip', draft => {
                const clip = draft.clips.find(item => item.id === selected.id)!
                clip.muted = !clip.muted
              })
            }
          >
            {selected.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </IconButton>
          <IconButton
            title="Duplicate clip"
            onClick={() =>
              edit('Duplicate clip', draft => {
                duplicateClip(draft, selected.id)
              })
            }
          >
            <Copy size={14} />
          </IconButton>
          <IconButton
            title="Split clip at playhead"
            disabled={positionBeats <= selected.start || positionBeats >= selected.start + selected.length}
            onClick={() =>
              edit('Split clip', draft => {
                splitClip(draft, selected.id, snapBeat(positionBeats, 0.25))
              })
            }
          >
            <Scissors size={14} />
          </IconButton>
          <IconButton title="Delete clip" onClick={() => deleteClip(selected.id)}>
            <Trash2 size={14} />
          </IconButton>
        </div>
      )}
      <div className="section-foot">
        <span>
          {project.clips.length} CLIPS <b>/</b> {project.lanes.length} LANES
        </span>
        <span>Double-click a lane to add the current pattern. Drag edges to resize.</span>
        <span>{((arrangementEnd(project) * 60) / project.bpm).toFixed(1)} SEC</span>
      </div>
    </section>
  )
}

function ClipPreview({ clip }: { clip: Clip }) {
  const project = useStudio(state => state.project)
  if (clip.kind === 'pattern') {
    const pattern = project.patterns.find(item => item.id === clip.patternId)
    if (!pattern) return null
    const steps = pattern.trackSteps[0]?.steps.length ?? 16
    return (
      <div className="mini-steps">
        {Array.from({ length: Math.min(steps, 32) }, (_, step) => (
          <i key={step} className={pattern.trackSteps.some(row => row.steps[step]?.active) ? 'on' : ''} />
        ))}
      </div>
    )
  }
  if (clip.kind === 'midi') {
    const pitches = clip.notes.map(note => note.pitch)
    const low = Math.min(...pitches, 60)
    const high = Math.max(...pitches, 72)
    return (
      <svg
        className="mini-notes"
        viewBox={`0 0 ${Math.max(1, clip.length)} ${high - low + 1}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {clip.notes.map(note => (
          <rect key={note.id} x={note.start} y={high - note.pitch} width={Math.max(0.05, note.length)} height={0.9} />
        ))}
      </svg>
    )
  }
  if (clip.kind === 'automation') {
    const points = clip.points.length ? clip.points : [{ beat: 0, value: 0.5 }]
    return (
      <svg
        className="mini-curve"
        viewBox={`0 0 ${Math.max(1, clip.length)} 1`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <polyline
          points={points.map(point => `${point.beat},${1 - Math.max(0, Math.min(1, point.value))}`).join(' ')}
        />
      </svg>
    )
  }
  return <div className="mini-wave" />
}
