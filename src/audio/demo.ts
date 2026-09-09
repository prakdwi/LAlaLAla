import { encodeWav } from './wav'

export function factorySample(kind: number) {
  const sampleRate = 44100
  const data = new Float32Array(Math.ceil(sampleRate * (kind === 3 ? 1.2 : 0.6)))
  let phase = 0
  let seed = 42
  let previous = 0
  for (let index = 0; index < data.length; index++) {
    const time = index / sampleRate
    seed = (seed * 16807) % 2147483647
    const noise = seed / 2147483647 * 2 - 1
    if (kind === 0) {
      phase += 2 * Math.PI * (45 + 130 * Math.exp(-time * 35)) / sampleRate
      data[index] = Math.sin(phase) * Math.exp(-time * 10) * 0.9
    } else if (kind === 1) data[index] = (noise * 0.65 + Math.sin(2 * Math.PI * 180 * time) * 0.3) * Math.exp(-time * 18)
    else if (kind === 2) { data[index] = (noise - previous) * 0.35 * Math.exp(-time * 55); previous = noise }
    else data[index] = [130.81, 164.81, 196, 246.94].reduce((sum, hz) => sum + Math.sin(2 * Math.PI * hz * time), 0) * 0.14 * Math.exp(-time * 3) * Math.min(1, time * 100)
  }
  return encodeWav({ numberOfChannels: 1, length: data.length, sampleRate, getChannelData: () => data })
}