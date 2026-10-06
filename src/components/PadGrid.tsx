import { Grid2X2 } from 'lucide-react'
import { padKeys } from '../state/actions'
import { hitPad, padVelocity, stopRepeat } from '../state/mpc'
import { BANK_NAMES, padsInBank } from '../state/sampling'
import { useStudio } from '../state/store'

/** 4x4 performance pads for the current bank. Strike position sets velocity. */
export function PadGrid() {
  const { project, selectedTrackId, selectedPadId, flashes, ready, mpc } = useStudio()
  const track = project.tracks.find(item => item.id === selectedTrackId) ?? project.tracks[0]
  const pads = padsInBank(track, mpc.bank)
  const selected = track.pads.find(item => item.id === selectedPadId)
  const levels = mpc.levels !== 'off'
  return (
    <section className={`pads-section ${mpc.erase ? 'erase-mode' : ''} ${mpc.padMute ? 'mute-mode' : ''}`}>
      <div className="section-heading">
        <h2>
          <Grid2X2 size={15} />
          Performance pads
        </h2>
        <span>
          {levels ? `16 LEVELS / ${mpc.levels.toUpperCase()}` : `Bank ${BANK_NAMES[mpc.bank] ?? 'A'}`}{' '}
          <b>
            {String(mpc.bank * 16 + 1).padStart(2, '0')}-{String(mpc.bank * 16 + 16).padStart(2, '0')}
          </b>
        </span>
      </div>
      <div className="pad-grid">
        {Array.from({ length: 16 }, (_, index) => {
          const pad = levels ? selected : pads[index]
          const padNumber = mpc.bank * 16 + index + 1
          const label = levels
            ? mpc.levels === 'velocity'
              ? `${Math.round(((index + 1) / 16) * 100)}%`
              : `${index - 8 >= 0 ? '+' : ''}${index - 8} st`
            : pad?.name || (track.pads.indexOf(pad!) === 0 ? 'ORIGINAL' : `SLICE ${String(padNumber).padStart(2, '0')}`)
          return (
            <button
              key={pad ? `${pad.id}-${index}` : index}
              disabled={!ready || !pad}
              className={`pad ${pad && pad.id === selectedPadId && !levels ? 'selected' : ''} ${pad && flashes[pad.id] ? 'hit' : ''} ${pad?.mute ? 'muted' : ''} ${pad?.reverse ? 'reversed' : ''}`}
              onPointerDown={event => {
                event.preventDefault()
                void hitPad(track, index, padVelocity(event, mpc.fullLevel))
              }}
              onPointerUp={stopRepeat}
              onPointerLeave={stopRepeat}
              onPointerCancel={stopRepeat}
              onClick={event => {
                if (event.detail === 0) void hitPad(track, index, 1)
              }}
              aria-label={`Pad ${padNumber}`}
              aria-pressed={Boolean(pad) && selectedPadId === pad?.id && !levels}
            >
              <span className="pad-top">
                <span>{String(padNumber).padStart(2, '0')}</span>
                <kbd>{padKeys[index].toUpperCase()}</kbd>
              </span>
              <span className="pad-name">
                {track.name}
                <small>{label}</small>
              </span>
              <span className="pad-line" />
              {pad?.mute && <span className="pad-badge">MUTE</span>}
              {pad?.reverse && !pad.mute && <span className="pad-badge">REV</span>}
            </button>
          )
        })}
      </div>
      <div className="section-foot">
        <span>
          {mpc.erase
            ? 'ERASE: TAP A PAD TO CLEAR ITS STEPS'
            : mpc.padMute
              ? 'PAD MUTE: TAP TO MUTE / UNMUTE'
              : 'POLYPHONIC'}
        </span>
        <span>
          {track.pads.length} PADS <b>/</b> {Math.ceil(track.pads.length / 16)} BANK{track.pads.length > 16 ? 'S' : ''}
        </span>
      </div>
    </section>
  )
}
