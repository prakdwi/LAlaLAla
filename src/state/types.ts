export type EffectInstance = {
  id: string
  type: 'filter' | 'delay' | 'reverb' | 'bitcrush'
  enabled: boolean
  params: { cutoff: number; q: number; mode: 'lowpass' | 'highpass'; division: number; feedback: number; mix: number }
}
export type Pad = {
  id: string; startTime: number; endTime: number; gain: number; pan: number
  pitchSemitones: number; loop: boolean; chokeGroup: number; attack: number; release: number
  effects: EffectInstance[]
}
export type Track = {
  id: string; name: string; sampleBufferId: string; pads: Pad[]; volume: number
  pan: number; mute: boolean; solo: boolean; effects: EffectInstance[]; sequencerPadId: string
}
export type Step = { active: boolean; velocity: number; microTimingMs: number; padId?: string }
export type Pattern = { id: string; name: string; trackSteps: { trackId: string; steps: Step[] }[] }
export type SongSection = { id: string; name: string; patternId: string; repeatCount: number }
export type Project = {
  id: string; name: string; tracks: Track[]; patterns: Pattern[]; song: SongSection[]
  bpm: number; swing: number; masterVolume: number
  jamSource?: { videoId: string; start: number }
  jamPatternId?: string
}