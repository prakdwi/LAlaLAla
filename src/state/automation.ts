import type { AutomationClip, AutomationTarget, Project } from './types'

export const targetKey = (target: AutomationTarget) =>
  target.kind === 'master'
    ? 'master:volume'
    : target.kind === 'track'
      ? `track:${target.trackId}:${target.param}`
      : `effect:${target.trackId}:${target.effectId}:${target.param}`

/** Keys of every parameter that has at least one automation clip. The graph leaves these alone in sync(). */
export function automatedTargets(project: Project) {
  const keys = new Set<string>()
  for (const clip of project.clips) if (clip.kind === 'automation' && !clip.muted) keys.add(targetKey(clip.target))
  return keys
}

/** Linear interpolation across points; holds the first/last value outside their range. */
export function automationValueAt(clip: AutomationClip, beat: number): number | undefined {
  const local = beat - clip.start
  if (local < 0 || local >= clip.length || !clip.points.length) return undefined
  const points = clip.points
  if (local <= points[0].beat) return points[0].value
  for (let index = 1; index < points.length; index++) {
    const next = points[index]
    if (local <= next.beat) {
      const previous = points[index - 1]
      const span = next.beat - previous.beat
      const t = span > 0 ? (local - previous.beat) / span : 1
      return previous.value + (next.value - previous.value) * t
    }
  }
  return points[points.length - 1].value
}

/** All automation values active at `beat`, one per target (later lanes win). */
export function automationAt(project: Project, beat: number) {
  const values = new Map<string, { target: AutomationTarget; value: number }>()
  for (const clip of project.clips) {
    if (clip.kind !== 'automation' || clip.muted) continue
    const value = automationValueAt(clip, beat)
    if (value !== undefined) values.set(targetKey(clip.target), { target: clip.target, value })
  }
  return values
}

export type ParamRange = { min: number; max: number; step?: number; unit?: string; log?: boolean }

export function targetRange(target: AutomationTarget): ParamRange {
  if (target.kind === 'master') return { min: 0, max: 1.2 }
  if (target.kind === 'track') return target.param === 'pan' ? { min: -1, max: 1 } : { min: 0, max: 1.5 }
  switch (target.param) {
    case 'cutoff':
      return { min: 30, max: 18000, unit: 'Hz', log: true }
    case 'midFreq':
      return { min: 100, max: 8000, unit: 'Hz', log: true }
    case 'q':
      return { min: 0.1, max: 15 }
    case 'feedback':
      return { min: 0, max: 0.85 }
    case 'lowGain':
    case 'midGain':
    case 'highGain':
      return { min: -18, max: 18, unit: 'dB' }
    case 'threshold':
      return { min: -60, max: 0, unit: 'dB' }
    case 'ratio':
      return { min: 1, max: 20 }
    case 'rate':
      return { min: 0.05, max: 8, unit: 'Hz' }
    case 'depth':
      return { min: 0, max: 0.02 }
    case 'drive':
    case 'mix':
    default:
      return { min: 0, max: 1 }
  }
}

export function describeTarget(project: Project, target: AutomationTarget) {
  if (target.kind === 'master') return 'Master volume'
  const track = project.tracks.find(item => item.id === target.trackId)
  if (target.kind === 'track') return `${track?.name ?? 'Track'} ${target.param}`
  const effect = track?.effects.find(item => item.id === target.effectId)
  return `${track?.name ?? 'Track'} ${effect?.type ?? 'effect'} ${target.param}`
}
