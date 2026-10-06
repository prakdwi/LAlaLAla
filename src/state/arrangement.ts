import type { Clip, PatternClip, Project } from './types'
import { stepsPerBar, uid } from './defaults'

/** Deep copy that also works on Immer drafts, unlike structuredClone. Clips are plain JSON. */
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export const beatsPerBar = (project: Pick<Project, 'timeSignature'>) => project.timeSignature.beats
export const patternBeats = (project: Pick<Project, 'timeSignature'>, bars: number) => bars * beatsPerBar(project)

/** Last beat with any clip, rounded up to a whole bar. Empty arrangements report one bar. */
export function arrangementEnd(project: Project) {
  const end = project.clips.reduce((max, clip) => Math.max(max, clip.start + clip.length), 0)
  const bar = beatsPerBar(project)
  return Math.max(bar, Math.ceil(end / bar) * bar)
}

export const clipsOnLane = (project: Project, laneId: string) =>
  project.clips.filter(clip => clip.laneId === laneId).sort((a, b) => a.start - b.start)

/** Pattern clips that cover a global step, with the local step inside their pattern. */
export function patternStepsAt(project: Project, step: number) {
  const beat = step / 4
  const result: { clip: PatternClip; patternId: string; localStep: number }[] = []
  for (const clip of project.clips) {
    if (clip.kind !== 'pattern' || clip.muted || beat < clip.start || beat >= clip.start + clip.length) continue
    const pattern = project.patterns.find(item => item.id === clip.patternId)
    if (!pattern) continue
    const total = pattern.bars * stepsPerBar(project)
    const localStep = (step - Math.round(clip.start * 4)) % total
    result.push({ clip, patternId: pattern.id, localStep })
  }
  return result
}

/** Next free position on a lane at or after `from`, in beats. */
export function nextFreeBeat(project: Project, laneId: string, from = 0) {
  return clipsOnLane(project, laneId).reduce((cursor, clip) => Math.max(cursor, clip.start + clip.length), from)
}

export function appendPatternClip(project: Project, patternId: string, name: string, repeats: number, laneId?: string) {
  const pattern = project.patterns.find(item => item.id === patternId)
  if (!pattern) throw new Error('Pattern not found.')
  const lane = project.lanes.find(item => item.id === laneId) ?? project.lanes[0]
  const length = Math.max(1, Math.min(64, Math.round(repeats) || 1)) * patternBeats(project, pattern.bars)
  const clip: PatternClip = {
    id: uid(),
    kind: 'pattern',
    name: name.trim() || pattern.name,
    laneId: lane.id,
    start: nextFreeBeat(project, lane.id),
    length,
    muted: false,
    patternId: pattern.id,
  }
  project.clips.push(clip)
  return clip.id
}

/** Snap a beat position to the grid. `grid` is in beats (1 = quarter, 0.25 = sixteenth). */
export const snapBeat = (beat: number, grid: number) => (grid > 0 ? Math.round(beat / grid) * grid : beat)

export function moveClip(project: Project, clipId: string, start: number, laneId?: string) {
  const clip = project.clips.find(item => item.id === clipId)
  if (!clip) return
  clip.start = Math.max(0, start)
  if (laneId && project.lanes.some(lane => lane.id === laneId)) clip.laneId = laneId
}

export function resizeClip(project: Project, clipId: string, length: number) {
  const clip = project.clips.find(item => item.id === clipId)
  if (clip) clip.length = Math.max(0.25, length)
}

export function duplicateClip(project: Project, clipId: string): string | undefined {
  const clip = project.clips.find(item => item.id === clipId)
  if (!clip) return
  const copy: Clip = clone(clip)
  copy.id = uid()
  copy.start = clip.start + clip.length
  if (copy.kind === 'midi') copy.notes = copy.notes.map(note => ({ ...note, id: uid() }))
  project.clips.push(copy)
  return copy.id
}

export function splitClip(project: Project, clipId: string, beat: number): string | undefined {
  const clip = project.clips.find(item => item.id === clipId)
  if (!clip || beat <= clip.start || beat >= clip.start + clip.length) return
  const right: Clip = clone(clip)
  right.id = uid()
  right.start = beat
  right.length = clip.start + clip.length - beat
  clip.length = beat - clip.start
  if (right.kind === 'audio') right.offset += right.start - clip.start
  if (right.kind === 'midi') {
    const offset = right.start - clip.start
    right.notes = right.notes
      .filter(note => note.start >= offset)
      .map(note => ({ ...note, id: uid(), start: note.start - offset }))
    const left = clip as typeof right
    left.notes = left.notes.filter(note => note.start < offset)
  }
  project.clips.push(right)
  return right.id
}
