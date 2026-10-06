import { useEffect, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useStudio } from '../state/store'
import { describeTarget, targetRange } from '../state/automation'
import { snapBeat } from '../state/arrangement'
import type { AutomationClip } from '../state/types'

/** Breakpoint editor for automation clips. Click to add, drag to move, double-click to delete. */
export function AutomationEditor({ clip }: { clip: AutomationClip }) {
  const { project, edit, positionBeats, quantize } = useStudio()
  const canvas = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const range = targetRange(clip.target)
  const toNormal = (value: number) =>
    range.log
      ? Math.log(Math.max(range.min, value) / range.min) / Math.log(range.max / range.min)
      : (value - range.min) / (range.max - range.min)
  const fromNormal = (n: number) =>
    range.log ? range.min * (range.max / range.min) ** n : range.min + (range.max - range.min) * n
  const update = (label: string, change: (target: AutomationClip) => void, key?: string) =>
    edit(
      label,
      draft => {
        const target = draft.clips.find(item => item.id === clip.id)
        if (target?.kind === 'automation') change(target)
      },
      key,
    )
  const position = (event: { clientX: number; clientY: number }) => {
    const bounds = canvas.current!.getBoundingClientRect()
    const beat = Math.max(0, Math.min(clip.length, ((event.clientX - bounds.left) / bounds.width) * clip.length))
    const normal = Math.max(0, Math.min(1, 1 - (event.clientY - bounds.top) / bounds.height))
    return { beat: snapBeat(beat, quantize ? 0.25 : 0), value: fromNormal(normal) }
  }
  useEffect(() => {
    if (drag === null) return
    const move = (event: PointerEvent) => {
      const next = position(event)
      update(
        'Move automation point',
        target => {
          const point = target.points[drag]
          if (!point) return
          point.value = next.value
          const previous = target.points[drag - 1]?.beat ?? 0
          const following = target.points[drag + 1]?.beat ?? target.length
          point.beat = Math.max(previous, Math.min(following, next.beat))
        },
        `auto-${clip.id}-${drag}`,
      )
    }
    const up = () => setDrag(null)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- handlers are recreated per render; the listeners only need the drag state
  }, [drag, clip.id, quantize])
  const points = [...clip.points].sort((a, b) => a.beat - b.beat)
  const path = points.length
    ? `M 0 ${100 - toNormal(points[0].value) * 100} ` +
      points.map(point => `L ${(point.beat / clip.length) * 100} ${100 - toNormal(point.value) * 100}`).join(' ') +
      ` L 100 ${100 - toNormal(points.at(-1)!.value) * 100}`
    : ''
  const format = (value: number) =>
    range.unit === 'Hz' ? `${Math.round(value)} Hz` : range.unit === 'dB' ? `${value.toFixed(1)} dB` : value.toFixed(2)
  return (
    <section className="automation-section" aria-label="Automation editor">
      <div className="section-heading">
        <h2>
          Automation <span className="tag">{describeTarget(project, clip.target)}</span>
        </h2>
        <div className="inline-actions">
          <span className="eyebrow">
            {format(range.min)} – {format(range.max)}
          </span>
          <button
            disabled={!clip.points.length}
            onClick={() =>
              update('Clear automation', target => {
                target.points = []
              })
            }
          >
            <Trash2 size={13} />
            Clear
          </button>
        </div>
      </div>
      <div
        className="automation-canvas"
        ref={canvas}
        onPointerDown={event => {
          const target = event.target as HTMLElement
          if (
            target !== event.currentTarget &&
            !target.classList.contains('automation-svg') &&
            !target.classList.contains('automation-col')
          )
            return
          const next = position(event)
          let index = 0
          update('Add automation point', target => {
            target.points.push(next)
            target.points.sort((a, b) => a.beat - b.beat)
            index = target.points.findIndex(
              point => point === next || (point.beat === next.beat && point.value === next.value),
            )
          })
          setDrag(index)
        }}
      >
        {Array.from({ length: Math.ceil(clip.length) + 1 }, (_, index) => (
          <i
            key={index}
            className={`automation-col ${index % project.timeSignature.beats === 0 ? 'bar' : ''}`}
            style={{ left: `${(index / clip.length) * 100}%` }}
          />
        ))}
        <svg className="automation-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {path && <path d={path} />}
        </svg>
        {points.map((point, index) => (
          <button
            key={index}
            className="automation-point"
            aria-label={`Automation point at beat ${point.beat}, value ${format(point.value)}`}
            style={{ left: `${(point.beat / clip.length) * 100}%`, top: `${100 - toNormal(point.value) * 100}%` }}
            onPointerDown={event => {
              event.stopPropagation()
              setDrag(clip.points.indexOf(point))
            }}
            onDoubleClick={event => {
              event.stopPropagation()
              update('Delete automation point', target => {
                target.points.splice(target.points.indexOf(point), 1)
              })
            }}
          />
        ))}
        {positionBeats >= clip.start && positionBeats < clip.start + clip.length && (
          <div className="piano-playhead" style={{ left: `${((positionBeats - clip.start) / clip.length) * 100}%` }} />
        )}
      </div>
      <div className="section-foot">
        <span>{clip.points.length} POINTS</span>
        <span>Click to add a point, drag to move, double-click to remove.</span>
      </div>
    </section>
  )
}
