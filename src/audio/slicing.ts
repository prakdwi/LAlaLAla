export function detectSlices(data: Float32Array, sampleRate: number, maxSlices = 16): number[] {
  if (!data.length) return [0]
  const windowSize = Math.max(1, Math.round(sampleRate * 0.01))
  const energies: number[] = []
  for (let offset = 0; offset < data.length; offset += windowSize) {
    let sum = 0
    const end = Math.min(data.length, offset + windowSize)
    for (let index = offset; index < end; index++) sum += data[index] ** 2
    energies.push(Math.sqrt(sum / (end - offset)))
  }
  const peak = Math.max(...energies.slice(0, 1))
  const maximum = energies.reduce((value, energy) => Math.max(value, energy), peak)
  const starts = [0]
  let previous = 0
  for (let index = 0; index < energies.length && starts.length < maxSlices; index++) {
    const time = index * windowSize / sampleRate
    if (energies[index] > Math.max(maximum * 0.12, previous * 2.2, 0.008) && time - starts.at(-1)! >= 0.09) {
      starts.push(Math.max(0, time - 0.005))
    }
    previous = previous * 0.65 + energies[index] * 0.35
  }
  return starts
}