import { useEffect, useRef, useState } from 'react'
import { Magnet, Minus, Plus, Trash2 } from 'lucide-react'
import { useStudio } from '../state/store'
import { noteOff, noteOn } from '../state/actions'
import { isBlackKey, noteName } from '../audio/midi'
import { snapBeat } from '../state/arrangement'
import { uid } from '../state/defaults'
import type { MidiClip, Note } from '../state/types'
import { IconButton, Range } from './Controls'

const ROW = 14
const LOW = 24
const HIGH = 108

type Drag = {
  kind: 'move' | 'resize' | 'create' | 'velocity'
  noteId: string
  originX: number
  originY: number
  start: number
  pitch: number
  length: number
  velocity: number
}

/** Grid editor for MIDI clips. Click to add notes, drag to move, drag the right edge to resize. */
export function PianoRoll({ clip }: { clip: MidiClip }) {
  const { project, edit, positionBeats, noteFlashes, quantize } = useStudio()
  const track = project.tracks.find(item => item.id === clip.trackId)
  const [zoom, setZoom] = useState(64)
  const [selected, setSelected] = useState<string>('')
  const [drag, setDrag] = useState<Drag | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const grid = quantize ? 0.25 : 0
  const width = clip.length * zoom
  const pitches = Array.from({ length: HIGH - LOW }, (_, index) => HIGH - 1 - index)
  const y = (pitch: number) => (HIGH - 1 - pitch) * ROW
  useEffect(() => {
    const element = scroller.current
    if (!element) return
    const center = clip.notes.length ? clip.notes.reduce((sum, note) => sum + note.pitch, 0) / clip.notes.length : 64
    element.scrollTop = y(Math.round(center)) - element.clientHeight / 2
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- handlers are recreated per render; the listeners only need the drag state
  }, [clip.id])
  const update = (label: string, change: (notes: Note[]) => void, key?: string) =>
    edit(
      label,
      draft => {
        const target = draft.clips.find(item => item.id === clip.id)
        if (target?.kind === 'midi') change(target.notes)
      },
      key,
    )
  useEffect(() => {
    if (!drag) return
    const move = (event: PointerEvent) => {
      const dx = (event.clientX - drag.originX) / zoom
      const dy = Math.round((event.clientY - drag.originY) / ROW)
      if (drag.kind === 'move') {
        update(
          'Move note',
          notes => {
            const note = notes.find(item => item.id === drag.noteId)
            if (!note) return
            note.start = Math.max(0, Math.min(clip.length - note.length, snapBeat(drag.start + dx, grid)))
            note.pitch = Math.max(LOW, Math.min(HIGH - 1, drag.pitch - dy))
          },
          `note-move-${drag.noteId}`,
        )
      } else if (drag.kind === 'resize' || drag.kind === 'create') {
        update(
          'Resize note',
          notes => {
            const note = notes.find(item => item.id === drag.noteId)
            if (note)
              note.length = Math.max(
                grid || 0.125,
                Math.min(clip.length - note.start, snapBeat(drag.length + dx, grid)),
              )
          },
          `note-resize-${drag.noteId}`,
        )
      } else if (drag.kind === 'velocity') {
        update(
          'Note velocity',
          notes => {
            const note = notes.find(item => item.id === drag.noteId)
            if (note) note.velocity = Math.max(0.05, Math.min(1, drag.velocity - (event.clientY - drag.originY) / 100))
          },
          `note-vel-${drag.noteId}`,
        )
      }
    }
    const up = () => setDrag(null)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- handlers are recreated per render; the listeners only need the drag state
  }, [drag, zoom, grid, clip.length])
  const selectedNote = clip.notes.find(note => note.id === selected)
  const local =
    positionBeats >= clip.start && positionBeats < clip.start + clip.length
      ? (positionBeats - clip.start) % Math.max(0.25, clip.loopLength || clip.length)
      : -1
  return (
    <section className="piano-roll-section" aria-label="Piano roll">
      <div className="section-heading">
        <h2>
          Piano roll <span className="tag">{clip.name}</span>
        </h2>
        <div className="inline-actions">
          <span className="eyebrow">{track?.name}</span>
          <button
            className={`toggle ${quantize ? 'on' : ''}`}
            aria-pressed={quantize}
            onClick={() => useStudio.setState({ quantize: !quantize })}
            title="Snap to 1/16"
          >
            <Magnet size={13} />
            1/16
          </button>
          <label>
            Loop
            <input
              aria-label="Clip loop length"
              type="number"
              min={0.25}
              step={0.25}
              value={clip.loopLength}
              onChange={event =>
                edit('Loop length', draft => {
                  const target = draft.clips.find(item => item.id === clip.id)
                  if (target?.kind === 'midi') target.loopLength = Math.max(0.25, Number(event.target.value) || 0.25)
                })
              }
            />
          </label>
          <IconButton title="Zoom out piano roll" onClick={() => setZoom(Math.max(16, zoom / 1.5))}>
            <Minus size={14} />
          </IconButton>
          <IconButton title="Zoom in piano roll" onClick={() => setZoom(Math.min(256, zoom * 1.5))}>
            <Plus size={14} />
          </IconButton>
          <button
            disabled={!clip.notes.length}
            onClick={() =>
              update('Clear notes', notes => {
                notes.length = 0
              })
            }
          >
            <Trash2 size={13} />
            Clear
          </button>
        </div>
      </div>
      <div className="piano-scroll" ref={scroller}>
        <div className="piano-canvas" style={{ width: width + 56, height: pitches.length * ROW }}>
          <div className="piano-keys">
            {pitches.map(pitch => (
              <button
                key={pitch}
                className={`piano-key ${isBlackKey(pitch) ? 'black' : ''} ${noteFlashes[`${clip.trackId}:${pitch}`] ? 'hit' : ''}`}
                style={{ top: y(pitch), height: ROW }}
                aria-label={`Preview ${noteName(pitch)}`}
                onPointerDown={() => track && void noteOn(track, pitch, 0.8)}
                onPointerUp={() => track && noteOff(track, pitch)}
                onPointerLeave={() => track && noteOff(track, pitch)}
              >
                {pitch % 12 === 0 ? noteName(pitch) : ''}
              </button>
            ))}
          </div>
          <div
            className="piano-grid"
            style={{ width, left: 56 }}
            onPointerDown={event => {
              const target = event.target as HTMLElement
              if (
                target !== event.currentTarget &&
                !target.classList.contains('piano-row') &&
                !target.classList.contains('piano-col')
              )
                return
              const bounds = event.currentTarget.getBoundingClientRect()
              const beat = snapBeat((event.clientX - bounds.left) / zoom, grid || 0.0625)
              const pitch = HIGH - 1 - Math.floor((event.clientY - bounds.top) / ROW)
              const id = uid()
              update('Add note', notes =>
                notes.push({
                  id,
                  pitch,
                  start: Math.max(0, Math.min(clip.length - 0.25, beat)),
                  length: grid || 0.25,
                  velocity: 0.8,
                }),
              )
              setSelected(id)
              if (track) {
                void noteOn(track, pitch, 0.8)
                setTimeout(() => noteOff(track, pitch), 150)
              }
              setDrag({
                kind: 'create',
                noteId: id,
                originX: event.clientX,
                originY: event.clientY,
                start: beat,
                pitch,
                length: grid || 0.25,
                velocity: 0.8,
              })
            }}
          >
            {pitches.map(pitch => (
              <i
                key={pitch}
                className={`piano-row ${isBlackKey(pitch) ? 'black' : ''} ${pitch % 12 === 0 ? 'octave' : ''}`}
                style={{ top: y(pitch), height: ROW }}
              />
            ))}
            {Array.from({ length: Math.ceil(clip.length * 4) + 1 }, (_, index) => (
              <i
                key={index}
                className={`piano-col ${index % 4 === 0 ? 'beat' : ''} ${index % (project.timeSignature.beats * 4) === 0 ? 'bar' : ''}`}
                style={{ left: (index / 4) * zoom }}
              />
            ))}
            {clip.loopLength < clip.length && <i className="piano-loop-end" style={{ left: clip.loopLength * zoom }} />}
            {clip.notes.map(note => (
              <div
                key={note.id}
                role="button"
                tabIndex={0}
                aria-label={`Note ${noteName(note.pitch)} at beat ${note.start}`}
                className={`piano-note ${note.id === selected ? 'selected' : ''}`}
                style={{
                  left: note.start * zoom,
                  top: y(note.pitch),
                  width: Math.max(4, note.length * zoom),
                  height: ROW - 1,
                  opacity: 0.45 + note.velocity * 0.55,
                }}
                onPointerDown={event => {
                  event.stopPropagation()
                  setSelected(note.id)
                  const resize = event.nativeEvent.offsetX > note.length * zoom - 8
                  setDrag({
                    kind: event.altKey ? 'velocity' : resize ? 'resize' : 'move',
                    noteId: note.id,
                    originX: event.clientX,
                    originY: event.clientY,
                    start: note.start,
                    pitch: note.pitch,
                    length: note.length,
                    velocity: note.velocity,
                  })
                }}
                onDoubleClick={event => {
                  event.stopPropagation()
                  update('Delete note', notes => {
                    const index = notes.findIndex(item => item.id === note.id)
                    if (index >= 0) notes.splice(index, 1)
                  })
                }}
                onKeyDown={event => {
                  if (event.key === 'Delete' || event.key === 'Backspace')
                    update('Delete note', notes => {
                      const index = notes.findIndex(item => item.id === note.id)
                      if (index >= 0) notes.splice(index, 1)
                    })
                }}
              >
                <span>{noteName(note.pitch)}</span>
              </div>
            ))}
            {local >= 0 && <div className="piano-playhead" style={{ left: local * zoom }} />}
          </div>
        </div>
      </div>
      <div className="section-foot piano-foot">
        <span>{clip.notes.length} NOTES</span>
        {selectedNote ? (
          <div className="note-detail">
            <strong>{noteName(selectedNote.pitch)}</strong>
            <Range
              label="Velocity"
              value={selectedNote.velocity}
              min={0.05}
              max={1}
              format={`${Math.round(selectedNote.velocity * 100)}%`}
              onChange={value =>
                update(
                  'Note velocity',
                  notes => {
                    const note = notes.find(item => item.id === selectedNote.id)
                    if (note) note.velocity = value
                  },
                  `vel-${selectedNote.id}`,
                )
              }
            />
            <label>
              Start
              <input
                aria-label="Note start"
                type="number"
                step={0.25}
                min={0}
                value={selectedNote.start}
                onChange={event =>
                  update('Note start', notes => {
                    const note = notes.find(item => item.id === selectedNote.id)
                    if (note) note.start = Math.max(0, Number(event.target.value) || 0)
                  })
                }
              />
            </label>
            <label>
              Length
              <input
                aria-label="Note length"
                type="number"
                step={0.25}
                min={0.125}
                value={selectedNote.length}
                onChange={event =>
                  update('Note length', notes => {
                    const note = notes.find(item => item.id === selectedNote.id)
                    if (note) note.length = Math.max(0.125, Number(event.target.value) || 0.125)
                  })
                }
              />
            </label>
            <IconButton
              title="Delete note"
              onClick={() =>
                update('Delete note', notes => {
                  const index = notes.findIndex(item => item.id === selectedNote.id)
                  if (index >= 0) notes.splice(index, 1)
                })
              }
            >
              <Trash2 size={14} />
            </IconButton>
          </div>
        ) : (
          <span>Click to add. Drag right edge to resize. Alt-drag for velocity. Double-click to delete.</span>
        )}
      </div>
    </section>
  )
}
