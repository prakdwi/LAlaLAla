import { KeyRound, Lock, LockOpen } from 'lucide-react'
import { setScaleLock, useStudio } from '../state/store'
import { SCALE_NAMES, SCALES } from '../state/scale'
import { NOTE_NAMES } from '../audio/midi'
import type { ChordVoicing } from '../state/scale'

/** Project key (root + scale) with the scale-lock toggle. Lives in the transport. */
export function KeyPicker() {
  const { project, edit, scaleLock } = useStudio()
  return (
    <div className="key-picker" title="Project key: scale lock and chord mode follow it">
      <KeyRound size={13} aria-hidden="true" />
      <select
        aria-label="Key root"
        value={project.key.root}
        onChange={event =>
          edit('Key root', draft => {
            draft.key.root = Number(event.target.value)
          })
        }
      >
        {NOTE_NAMES.map((name, index) => (
          <option key={name} value={index}>
            {name}
          </option>
        ))}
      </select>
      <select
        aria-label="Scale"
        value={project.key.scale}
        onChange={event =>
          edit('Scale', draft => {
            draft.key.scale = event.target.value as typeof draft.key.scale
          })
        }
      >
        {SCALE_NAMES.map(name => (
          <option key={name} value={name}>
            {SCALES[name].label}
          </option>
        ))}
      </select>
      <button
        className={`toggle ${scaleLock ? 'on' : ''}`}
        aria-pressed={scaleLock}
        onClick={() => setScaleLock(!scaleLock)}
        title={scaleLock ? 'Scale lock on: notes snap into the key' : 'Scale lock off: any note can be played'}
        aria-label={scaleLock ? 'Scale lock on' : 'Scale lock off'}
      >
        {scaleLock ? <LockOpen size={12} /> : <Lock size={12} />}
        {scaleLock ? 'In key' : 'Free'}
      </button>
    </div>
  )
}

const VOICINGS: { id: ChordVoicing | 'off'; label: string; title: string }[] = [
  { id: 'off', label: 'Single', title: 'One note per key' },
  { id: 'triad', label: 'Triad', title: 'Three-note chord built from the key' },
  { id: 'seventh', label: '7th', title: 'Four-note chord with the seventh' },
  { id: 'spread', label: 'Spread', title: 'Open voicing across two octaves' },
  { id: 'power', label: 'Power', title: 'Root, fifth and octave' },
]

/** Chord mode selector, shared by the keyboard and the piano roll. */
export function ChordModePicker() {
  const { chordMode } = useStudio()
  return (
    <label className="chord-mode" title="Chord mode: each key or click plays a chord from the project key">
      Chord
      <select
        aria-label="Chord mode"
        value={chordMode}
        onChange={event => useStudio.setState({ chordMode: event.target.value as ChordVoicing | 'off' })}
      >
        {VOICINGS.map(voicing => (
          <option key={voicing.id} value={voicing.id} title={voicing.title}>
            {voicing.label}
          </option>
        ))}
      </select>
    </label>
  )
}
