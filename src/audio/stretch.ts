/**
 * Time-stretch without pitch change (WSOLA: waveform-similarity overlap-add). Good for drums,
 * loops and vocals at ratios between about 0.5 and 2. Pure Float32Array in, Float32Array out, so
 * it runs the same in a worker, on the main thread and in tests.
 *
 * `ratio` = output length / input length (1.2 = 20% longer = slower).
 */
export function stretchChannel(input: Float32Array, ratio: number, sampleRate = 44100): Float32Array {
  if (Math.abs(ratio - 1) < 1e-4 || input.length === 0) return input.slice()
  const window = Math.max(256, Math.round(sampleRate * 0.03)) // 30 ms grains
  const hop = Math.floor(window / 2)
  const search = Math.floor(window / 4)
  const outputLength = Math.round(input.length * ratio)
  const output = new Float32Array(outputLength + window)
  const weight = new Float32Array(outputLength + window)
  const hann = new Float32Array(window)
  for (let index = 0; index < window; index++) hann[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / window)

  let outPosition = 0
  let previousInput = 0
  // the first grain is copied as-is
  const place = (inPosition: number) => {
    for (let index = 0; index < window; index++) {
      const sample = input[inPosition + index] ?? 0
      output[outPosition + index] += sample * hann[index]
      weight[outPosition + index] += hann[index]
    }
  }
  place(0)
  outPosition += hop
  while (outPosition < outputLength) {
    // where the source should be for this output hop, before the similarity search
    const nominal = Math.round(outPosition / ratio)
    // the continuation of the previous grain is what the next grain should resemble
    const natural = previousInput + hop
    let best = nominal
    let bestScore = -Infinity
    const from = Math.max(0, nominal - search)
    const to = Math.min(input.length - window, nominal + search)
    for (let candidate = from; candidate <= to; candidate += 4) {
      let score = 0
      for (let index = 0; index < hop; index += 2)
        score += (input[natural + index] ?? 0) * (input[candidate + index] ?? 0)
      if (score > bestScore) {
        bestScore = score
        best = candidate
      }
    }
    if (best < 0) best = 0
    place(best)
    previousInput = best
    outPosition += hop
  }
  const result = new Float32Array(outputLength)
  for (let index = 0; index < outputLength; index++)
    result[index] = weight[index] > 1e-6 ? output[index] / weight[index] : 0
  return result
}

/** Stretches every channel of a buffer; returns a new AudioBuffer in `context`. */
export function stretchBuffer(context: BaseAudioContext, buffer: AudioBuffer, ratio: number): AudioBuffer {
  const length = Math.max(1, Math.round(buffer.length * ratio))
  const result = context.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate)
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const stretched = stretchChannel(buffer.getChannelData(channel), ratio, buffer.sampleRate)
    result.getChannelData(channel).set(stretched.subarray(0, length))
  }
  return result
}

/** Playback ratio for a clip recorded at `sourceBpm` to follow `bpm`. */
export const stretchRatio = (sourceBpm: number, bpm: number) =>
  sourceBpm > 0 && bpm > 0 ? Math.max(0.25, Math.min(4, sourceBpm / bpm)) : 1
