import { expect, it } from 'vitest'
import { detectSlices } from './slicing'
import { encodeWav } from './wav'

it('detects separated energy transients and respects a minimum gap', () => {
  const data = new Float32Array(1000)
  data.fill(0.8, 200, 220); data.fill(0.9, 600, 620)
  const slices = detectSlices(data, 1000)
  expect(slices).toHaveLength(3)
  expect(slices[1]).toBeCloseTo(0.195)
  expect(slices[2]).toBeCloseTo(0.595)
  expect(detectSlices(new Float32Array(1000), 1000)).toEqual([0])
})

it('encodes interleaved stereo PCM with a valid RIFF header and clipping', async () => {
  const blob = encodeWav({ numberOfChannels: 2, sampleRate: 44100, length: 2,
    getChannelData: channel => new Float32Array(channel ? [-1, 0.5] : [1.2, 0]) })
  const data = new DataView(await blob.arrayBuffer())
  expect(blob.size).toBe(52)
  expect(data.getUint32(24, true)).toBe(44100)
  expect(data.getUint16(22, true)).toBe(2)
  expect(data.getInt16(44, true)).toBe(32767)
  expect(data.getInt16(46, true)).toBe(-32768)
})