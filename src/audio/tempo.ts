/**
 * Tempo detection from an onset-strength envelope and autocorrelation. Aims at loops and drum
 * recordings between 60 and 200 BPM; the result is a suggestion the user can correct.
 */
export function detectBpm(data: Float32Array, sampleRate: number, range: [number, number] = [60, 200]) {
  if (data.length < sampleRate) return 0
  const frame = 512
  const frames = Math.floor(data.length / frame)
  const energy = new Float32Array(frames)
  for (let index = 0; index < frames; index++) {
    let sum = 0
    const from = index * frame
    for (let sample = 0; sample < frame; sample++) sum += data[from + sample] ** 2
    energy[index] = Math.sqrt(sum / frame)
  }
  // onset strength: positive change in energy, smoothed
  const onset = new Float32Array(frames)
  for (let index = 1; index < frames; index++) onset[index] = Math.max(0, energy[index] - energy[index - 1])
  let mean = 0
  for (const value of onset) mean += value
  mean /= frames || 1
  for (let index = 0; index < frames; index++) onset[index] -= mean

  const frameRate = sampleRate / frame
  const minLag = Math.floor((60 / range[1]) * frameRate)
  const maxLag = Math.ceil((60 / range[0]) * frameRate)
  let bestLag = 0
  let bestScore = -Infinity
  for (let lag = minLag; lag <= maxLag && lag < frames; lag++) {
    let score = 0
    for (let index = 0; index + lag < frames; index++) score += onset[index] * onset[index + lag]
    // mild preference for tempos near 120 so half/double-time ties resolve musically
    const bpm = (60 * frameRate) / lag
    score *= 1 - Math.abs(Math.log2(bpm / 120)) * 0.15
    if (score > bestScore) {
      bestScore = score
      bestLag = lag
    }
  }
  if (!bestLag) return 0
  // refine with a parabolic fit around the peak
  const at = (lag: number) => {
    let score = 0
    for (let index = 0; index + lag < frames; index++) score += onset[index] * onset[index + lag]
    return score
  }
  const left = at(bestLag - 1)
  const centre = at(bestLag)
  const right = at(bestLag + 1)
  const denominator = left - 2 * centre + right
  const offset = denominator ? (0.5 * (left - right)) / denominator : 0
  const lag = bestLag + Math.max(-0.5, Math.min(0.5, offset))
  return Math.round(((60 * frameRate) / lag) * 10) / 10
}
