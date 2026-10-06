import { describe, expect, it } from 'vitest'
import { LookaheadScheduler, stepTime } from './timing'

describe('audio-clock lookahead', () => {
  it('schedules in advance on absolute timestamps without timer drift', () => {
    let now = 10
    const events: { index: number; time: number }[] = []
    const scheduler = new LookaheadScheduler(
      () => now,
      event => events.push(event),
    )
    scheduler.start(120, 0, 16, false)
    expect(events).toEqual([{ index: 0, time: 10.08 }])
    now = 10.071
    scheduler.tick()
    expect(events[1].time).toBeCloseTo(10.205)
    now = 10.3
    scheduler.tick()
    expect(events[2].time).toBeCloseTo(10.33)
    expect(new Set(events.map(event => event.index)).size).toBe(events.length)
  })
  it('swings offbeats without moving the next bar', () => {
    expect(stepTime(1, 120, 1)).toBe(0.1875)
    expect(stepTime(16, 120, 1)).toBe(2)
    expect(stepTime(16000, 120, 0)).toBe(2000)
  })
  it('does not burst stale notes after a stalled main thread', () => {
    let now = 0
    const times: number[] = []
    const scheduler = new LookaheadScheduler(
      () => now,
      event => times.push(event.time),
    )
    scheduler.start(120, 0, 16, false)
    now = 1
    scheduler.tick()
    expect(times.slice(1).every(time => time >= now)).toBe(true)
  })
  const advance = (scheduler: LookaheadScheduler, set: (value: number) => void, from: number, to: number) => {
    for (let now = from; now <= to + 1e-9; now += 0.05) {
      set(now)
      scheduler.tick()
    }
  }
  it('changes tempo live while keeping the musical position', () => {
    let now = 0
    const events: { index: number; time: number }[] = []
    const scheduler = new LookaheadScheduler(
      () => now,
      event => events.push(event),
    )
    scheduler.start(120, 0, Infinity, false)
    advance(scheduler, value => (now = value), 0, 1.0)
    now = 1.08 // exactly 8 steps at 120 bpm
    expect(scheduler.position(now)).toBeCloseTo(8)
    scheduler.setTempo(60)
    expect(scheduler.position(now)).toBeCloseTo(8)
    advance(scheduler, value => (now = value), 1.08, 1.7)
    const next = events.filter(event => event.index >= 8)
    expect(next[0].index).toBe(8)
    expect(next[1].time - next[0].time).toBeCloseTo(0.25)
    expect(new Set(events.map(event => event.index)).size).toBe(events.length)
  })
  it('wraps a loop region and reports the wrap', () => {
    let now = 0
    const events: number[] = []
    let wrapped: [number, number] | null = null
    const scheduler = new LookaheadScheduler(
      () => now,
      event => events.push(event.index),
    )
    scheduler.onWrap = (step, time) => (wrapped = [step, time])
    scheduler.start(120, 0, Infinity, false, 0, { start: 4, end: 8 })
    advance(scheduler, value => (now = value), 0, 1.5)
    expect(events.slice(0, 10)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 4, 5])
    expect(wrapped).not.toBeNull()
    expect(wrapped![0]).toBe(4)
    expect(scheduler.timeOf(8) - scheduler.timeOf(4)).toBeCloseTo(0.5)
  })
  it('counts in from negative steps', () => {
    let now = 0
    const events: number[] = []
    const scheduler = new LookaheadScheduler(
      () => now,
      event => events.push(event.index),
    )
    scheduler.start(120, 0, Infinity, false, -4)
    advance(scheduler, value => (now = value), 0, 0.8)
    expect(events.slice(0, 6)).toEqual([-4, -3, -2, -1, 0, 1])
  })
})
