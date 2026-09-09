import type { Project } from '../state/types'

export const STEPS = 16
export const stepDuration = (bpm: number) => 60 / bpm / 4
export const stepTime = (index: number, bpm: number, swing: number) =>
  (index + (index % 2 ? swing * 0.5 : 0)) * stepDuration(bpm)

export function arrangement(project: Project) {
  return project.song.flatMap(section => Array.from({ length: section.repeatCount }, () => ({
    patternId: section.patternId, sectionId: section.id,
  })))
}

export type ClockEvent = { index: number; time: number }
export class LookaheadScheduler {
  private timer: ReturnType<typeof setInterval> | undefined
  private index = 0
  private origin = 0
  private bpm = 120
  private swing = 0
  private total = Infinity
  private clock: () => number
  private schedule: (event: ClockEvent) => void
  constructor(clock: () => number, schedule: (event: ClockEvent) => void) {
    this.clock = clock
    this.schedule = schedule
  }
  start(bpm: number, swing: number, total = Infinity, runTimer = true) {
    this.stop()
    this.bpm = bpm
    this.swing = swing
    this.total = total
    this.origin = this.clock() + 0.08
    this.index = 0
    this.tick()
    if (runTimer) this.timer = setInterval(() => this.tick(), 25)
    return this.origin
  }
  tick() {
    const now = this.clock()
    while (this.index < this.total) {
      const time = this.origin + stepTime(this.index, this.bpm, this.swing)
      if (time >= now + 0.15) break
      if (time >= now) this.schedule({ index: this.index, time })
      this.index++
    }
  }
  stop() { clearInterval(this.timer); this.timer = undefined }
}