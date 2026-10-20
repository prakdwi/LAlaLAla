/**
 * Live note input (on-screen keyboard, computer keys, MIDI) filtered through the project key:
 * scale lock snaps the pitch, chord mode expands it to a diatonic chord. One input pitch may
 * sound several voices, so note-off releases whatever note-on played.
 */
import { noteOff, noteOn } from './actions'
import { chordPitches, snapToScale } from './scale'
import { useStudio } from './store'
import type { Track } from './types'

const sounding = new Map<string, number[]>()

/** The pitches a played key resolves to under the current scale lock and chord mode. */
export function resolvePitches(pitch: number) {
  const { project, scaleLock, chordMode } = useStudio.getState()
  if (chordMode !== 'off') return chordPitches(project.key, pitch, chordMode)
  return [scaleLock ? snapToScale(project.key, pitch) : pitch]
}

export async function keyOn(track: Track, pitch: number, velocity = 0.9) {
  const id = `${track.id}:${pitch}`
  if (sounding.has(id)) return
  const pitches = resolvePitches(pitch)
  sounding.set(id, pitches)
  await Promise.all(pitches.map(target => noteOn(track, target, velocity)))
}

export function keyOff(track: Track, pitch: number) {
  const id = `${track.id}:${pitch}`
  const pitches = sounding.get(id)
  sounding.delete(id)
  for (const target of pitches ?? [pitch]) noteOff(track, target)
}

export function releaseKeys() {
  sounding.clear()
}
