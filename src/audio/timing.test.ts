import { describe, expect, it } from 'vitest'
import { LookaheadScheduler, stepTime } from './timing'

describe('audio-clock lookahead', () => {
  it('schedules in advance on absolute timestamps without timer drift', () => {
    let now = 10
    const events: { index: number; time: number }[] = []
    const scheduler = new LookaheadScheduler(() => now, event => events.push(event))
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
    const scheduler = new LookaheadScheduler(() => now, event => times.push(event.time))
    scheduler.start(120, 0, 16, false)
    now = 1
    scheduler.tick()
    expect(times.slice(1).every(time => time >= now)).toBe(true)
  })
})