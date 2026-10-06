import type { Project } from '../state/types'
import { patternStepsAt, arrangementEnd } from '../state/arrangement'
import { stepsPerBar } from '../state/defaults'

/** Steps are sixteenth notes. */
export const STEPS = 16
export const stepDuration = (bpm: number) => 60 / bpm / 4
export const stepTime = (index: number, bpm: number, swing: number) =>
  (index + (index % 2 ? swing * 0.5 : 0)) * stepDuration(bpm)
export const beatToSeconds = (beat: number, bpm: number) => (beat * 60) / bpm
export const secondsToBeat = (seconds: number, bpm: number) => (seconds * bpm) / 60

export type BarSource = { patternId: string; sectionId: string }

/**
 * Pattern-mode playback: the selected pattern looped. Song mode resolves clips per step through
 * `patternStepsAt`, so this only describes the one-pattern case.
 */
export function patternBars(project: Project, patternId: string): BarSource[] {
  const pattern = project.patterns.find(item => item.id === patternId)
  return pattern ? Array.from({ length: pattern.bars }, () => ({ patternId, sectionId: '' })) : []
}

/** Total sixteenth steps in the arrangement. */
export const arrangementSteps = (project: Project) => Math.round(arrangementEnd(project) * 4)

/** Sixteenth steps in one bar of the project's time signature. */
export const barSteps = (project: Pick<Project, 'timeSignature'>) => stepsPerBar(project)

export { patternStepsAt }

export type ClockEvent = { index: number; time: number }

/**
 * Lookahead scheduler. `index` is a global sixteenth-step counter. Timing is anchored to an
 * origin on the audio clock; tempo changes re-anchor so the musical position is preserved and
 * loop regions jump the counter without touching the origin math.
 */
export class LookaheadScheduler {
  private timer: ReturnType<typeof setInterval> | undefined
  private index = 0
  private origin = 0
  private bpm = 120
  private swing = 0
  private total = Infinity
  private loop: { start: number; end: number } | null = null
  private clock: () => number
  private schedule: (event: ClockEvent) => void
  readonly horizon = 0.15
  /** Called when the loop region wraps, with the step jumped to and the audio time it sounds. */
  onWrap?: (step: number, time: number) => void
  constructor(clock: () => number, schedule: (event: ClockEvent) => void) {
    this.clock = clock
    this.schedule = schedule
  }
  /** Starts at `fromStep` and returns the audio time that step 0 maps to. */
  start(
    bpm: number,
    swing: number,
    total = Infinity,
    runTimer = true,
    fromStep = 0,
    loop: { start: number; end: number } | null = null,
  ) {
    this.stop()
    this.bpm = bpm
    this.swing = swing
    this.total = total
    this.loop = loop && loop.end > loop.start ? loop : null
    this.index = fromStep
    this.origin = this.clock() + 0.08 - stepTime(fromStep, bpm, swing)
    this.tick()
    if (runTimer) this.timer = setInterval(() => this.tick(), 25)
    return this.origin
  }
  get running() {
    return this.timer !== undefined
  }
  /** Current musical position in steps (fractional), derived from the audio clock. */
  position(now = this.clock()) {
    return (now - this.origin) / stepDuration(this.bpm)
  }
  /** Change tempo without stopping: keep the current musical position fixed at `now`. */
  setTempo(bpm: number, swing = this.swing) {
    const now = this.clock()
    const position = this.position(now)
    this.bpm = bpm
    this.swing = swing
    this.origin = now - position * stepDuration(bpm)
  }
  setLoop(loop: { start: number; end: number } | null) {
    this.loop = loop && loop.end > loop.start ? loop : null
  }
  /** Audio time at which a step sounds under the current anchor. */
  timeOf(step: number) {
    return this.origin + stepTime(step, this.bpm, this.swing)
  }
  /** Jump the counter to a step at the next tick without stopping. */
  seek(step: number) {
    const now = this.clock()
    this.index = step
    this.origin = now + 0.05 - stepTime(step, this.bpm, this.swing)
  }
  tick() {
    const now = this.clock()
    while (this.index < this.total) {
      if (this.loop && this.index >= this.loop.end) {
        // wrap: the time of loop.end becomes the time of loop.start
        const wrapTime = this.origin + stepTime(this.loop.end, this.bpm, this.swing)
        this.index = this.loop.start
        this.origin = wrapTime - stepTime(this.loop.start, this.bpm, this.swing)
        this.onWrap?.(this.loop.start, wrapTime)
        continue
      }
      const time = this.origin + stepTime(this.index, this.bpm, this.swing)
      if (time >= now + this.horizon) break
      if (time >= now) this.schedule({ index: this.index, time })
      this.index++
    }
  }
  stop() {
    clearInterval(this.timer)
    this.timer = undefined
  }
}
