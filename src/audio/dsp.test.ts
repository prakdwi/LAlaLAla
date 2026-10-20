import { expect, it } from 'vitest'
import { stretchChannel, stretchRatio } from './stretch'
import { detectBpm } from './tempo'

const rate = 44100

const sine = (seconds: number, hz: number) =>
  Float32Array.from({ length: Math.round(seconds * rate) }, (_, index) => Math.sin((2 * Math.PI * hz * index) / rate))

const dominantHz = (data: Float32Array) => {
  // zero-crossing estimate over the middle of the signal
  let crossings = 0
  const from = Math.floor(data.length * 0.25)
  const to = Math.floor(data.length * 0.75)
  for (let index = from + 1; index < to; index++) if (data[index - 1] < 0 && data[index] >= 0) crossings++
  return (crossings * rate) / (to - from)
}

it('stretches length while keeping pitch', () => {
  const input = sine(1, 220)
  for (const ratio of [0.5, 1.5, 2]) {
    const output = stretchChannel(input, ratio, rate)
    expect(output.length).toBe(Math.round(input.length * ratio))
    expect(Math.abs(dominantHz(output) - 220)).toBeLessThan(4)
    let peak = 0
    for (const sample of output) peak = Math.max(peak, Math.abs(sample))
    expect(peak).toBeLessThan(1.2)
    expect(peak).toBeGreaterThan(0.6)
  }
  expect(stretchChannel(input, 1, rate)).toEqual(input)
  expect(stretchRatio(90, 120)).toBeCloseTo(0.75)
  expect(stretchRatio(0, 120)).toBe(1)
})

it('detects the tempo of a click loop', () => {
  for (const bpm of [90, 128, 174]) {
    const seconds = 6
    const data = new Float32Array(seconds * rate)
    const period = (60 / bpm) * rate
    for (let beat = 0; beat * period < data.length; beat++) {
      const start = Math.round(beat * period)
      for (let index = 0; index < 400 && start + index < data.length; index++)
        data[start + index] = Math.sin(index * 0.5) * Math.exp(-index / 120) * (beat % 4 === 0 ? 1 : 0.7)
    }
    const detected = detectBpm(data, rate)
    expect(Math.abs(detected - bpm)).toBeLessThan(1.5)
  }
  expect(detectBpm(new Float32Array(100), rate)).toBe(0)
})
