import type { EffectInstance, Pad, Project } from './types'

export const uid = () => crypto.randomUUID()
export const makeEffect = (type: EffectInstance['type']): EffectInstance => ({
  id: uid(), type, enabled: false,
  params: { cutoff: 12000, q: 0.7, mode: 'lowpass', division: 0.5, feedback: 0.35, mix: 0.3 },
})
export const makePad = (startTime = 0, endTime = 0.6): Pad => ({
  id: uid(), startTime, endTime, gain: 0.8, pan: 0, pitchSemitones: 0,
  loop: false, chokeGroup: 0, attack: 0.002, release: 0.015, effects: [],
})
export function makeProject(): Project {
  const tracks = ['Kick', 'Snare', 'Closed hat', 'Keys'].map((name, index) => {
    const pads = Array.from({ length: 16 }, (_, padIndex) => ({ ...makePad(0, index === 3 ? 1.2 : 0.6),
      pitchSemitones: index === 3 ? padIndex : 0 }))
    return { id: uid(), name, sampleBufferId: `factory-${index}`, pads, volume: index === 2 ? 0.5 : 0.8,
      pan: 0, mute: false, solo: false, effects: ['filter', 'delay', 'reverb', 'bitcrush'].map(type => makeEffect(type as EffectInstance['type'])),
      sequencerPadId: pads[0].id }
  })
  const pattern = { id: uid(), name: 'Pattern A', trackSteps: tracks.map((track, index) => ({
    trackId: track.id,
    steps: Array.from({ length: 16 }, (_, step) => ({ active: (index === 0 ? [0, 6, 8] : index === 1 ? [4, 12] : index === 2 ? [0, 2, 4, 6, 8, 10, 12, 14] : [0, 10]).includes(step),
      velocity: index === 2 && step % 4 ? 0.55 : 0.85, microTimingMs: 0 })),
  })) }
  return { id: uid(), name: 'Late night sketches', tracks, patterns: [pattern],
    song: [{ id: uid(), name: 'Intro', patternId: pattern.id, repeatCount: 2 },
      { id: uid(), name: 'Main', patternId: pattern.id, repeatCount: 4 }], bpm: 92, swing: 0.12, masterVolume: 0.8 }
}