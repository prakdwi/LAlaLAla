import { Keyboard, Piano } from 'lucide-react'
import { useStudio } from '../state/store'
import { noteOff, noteOn } from '../state/actions'
import { isBlackKey, noteName, PIANO_KEYS } from '../audio/midi'
import type { Track } from '../state/types'

const KEY_FOR_OFFSET = Object.fromEntries(Object.entries(PIANO_KEYS).map(([key, offset]) => [offset, key]))

/** Two-octave on-screen keyboard for keys and synth tracks. The computer keyboard mirrors it. */
export function KeyboardPiano({ track }: { track: Track }) {
  const { noteFlashes, ready, edit, keyboardOctave: octave } = useStudio()
  const setOctave = (value: number) => useStudio.setState({ keyboardOctave: value })
  const base = octave * 12 + 12
  const pitches = Array.from({ length: 25 }, (_, index) => base + index)
  const whites = pitches.filter(pitch => !isBlackKey(pitch))
  return (
    <section className="pads-section keyboard-section" aria-label="On-screen keyboard">
      <div className="section-heading">
        <h2>
          <Piano size={15} />
          Keyboard
        </h2>
        <div className="inline-actions">
          {track.kind === 'keys' && (
            <label>
              Root
              <input
                aria-label="Sample root note"
                type="number"
                min={24}
                max={96}
                value={track.rootNote}
                onChange={event =>
                  edit('Root note', draft => {
                    draft.tracks.find(item => item.id === track.id)!.rootNote = Math.max(
                      24,
                      Math.min(96, Number(event.target.value) || 60),
                    )
                  })
                }
              />
              <span className="eyebrow">{noteName(track.rootNote)}</span>
            </label>
          )}
          <button onClick={() => setOctave(Math.max(0, octave - 1))} aria-label="Octave down">
            -
          </button>
          <span className="tag">C{octave}</span>
          <button onClick={() => setOctave(Math.min(7, octave + 1))} aria-label="Octave up">
            +
          </button>
        </div>
      </div>
      <div className="piano-keyboard" data-octave={octave}>
        {whites.map(pitch => (
          <button
            key={pitch}
            className={`white-key ${noteFlashes[`${track.id}:${pitch}`] ? 'hit' : ''}`}
            aria-label={`Key ${noteName(pitch)}`}
            disabled={!ready}
            onPointerDown={event => {
              event.preventDefault()
              void noteOn(track, pitch, 0.9)
            }}
            onPointerUp={() => noteOff(track, pitch)}
            onPointerLeave={() => noteOff(track, pitch)}
            onPointerCancel={() => noteOff(track, pitch)}
          >
            <small>{noteName(pitch)}</small>
            <kbd>{KEY_FOR_OFFSET[pitch - base]?.toUpperCase() ?? ''}</kbd>
          </button>
        ))}
        {pitches.filter(isBlackKey).map(pitch => {
          const whiteIndex = whites.filter(white => white < pitch).length
          return (
            <button
              key={pitch}
              className={`black-key ${noteFlashes[`${track.id}:${pitch}`] ? 'hit' : ''}`}
              style={{ left: `calc(${(whiteIndex / whites.length) * 100}% - 1.6%)` }}
              aria-label={`Key ${noteName(pitch)}`}
              disabled={!ready}
              onPointerDown={event => {
                event.preventDefault()
                void noteOn(track, pitch, 0.9)
              }}
              onPointerUp={() => noteOff(track, pitch)}
              onPointerLeave={() => noteOff(track, pitch)}
              onPointerCancel={() => noteOff(track, pitch)}
            >
              <kbd>{KEY_FOR_OFFSET[pitch - base]?.toUpperCase() ?? ''}</kbd>
            </button>
          )
        })}
      </div>
      <div className="section-foot">
        <span>
          <Keyboard size={12} /> A S D F G H J K L for white keys, W E T Y U O P for sharps. Z / X shift octave.
        </span>
        <span>{track.kind === 'synth' ? 'POLYPHONIC SYNTH' : 'PITCHED SAMPLER'}</span>
      </div>
    </section>
  )
}
