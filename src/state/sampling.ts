import type { Project, Track } from './types'
import { makePad } from './defaults'

/**
 * Replaces a track's sample and lays `starts` out across its pads. Pads keep their count (banks
 * survive), extra pads repeat the regions, and sequencer steps that pointed at old pads are
 * remapped by position so recorded patterns keep playing.
 */
export function assignSample(project: Project, trackId: string, bufferId: string, duration: number, starts: number[]) {
  const track = project.tracks.find(item => item.id === trackId)
  if (!track) return
  const regions = starts.length ? starts : [0]
  const count = Math.max(16, track.pads.length)
  const oldPads = track.pads.map(pad => pad.id)
  const pads = Array.from({ length: count }, (_, index) => {
    const region = index % regions.length
    const previous = track.pads[index]
    const pad = makePad(regions[region], regions[region + 1] ?? duration)
    if (previous) {
      pad.gain = previous.gain
      pad.pan = previous.pan
      pad.chokeGroup = previous.chokeGroup
      pad.attack = previous.attack
      pad.release = previous.release
      pad.effects = previous.effects
    }
    return pad
  })
  track.sampleBufferId = bufferId
  track.pads = pads
  track.sequencerPadId = pads[0].id
  for (const pattern of project.patterns) {
    for (const step of pattern.trackSteps.find(row => row.trackId === track.id)?.steps ?? []) {
      if (step.padId) step.padId = pads[Math.max(0, oldPads.indexOf(step.padId))]?.id
    }
  }
}

/** Adds a bank of 16 pads that all play the whole sample. */
export function addPadBank(track: Track, duration: number) {
  if (track.pads.length >= 64) return
  for (let index = 0; index < 16; index++) track.pads.push(makePad(0, duration))
}

export const BANK_NAMES = ['A', 'B', 'C', 'D']
export const bankCount = (track: Track) => Math.max(1, Math.ceil(track.pads.length / 16))
export const padsInBank = (track: Track, bank: number) => track.pads.slice(bank * 16, bank * 16 + 16)
