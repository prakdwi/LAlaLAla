/**
 * Drum synthesis rendered straight to sample data (no audio graph), so the Sound Lab can design
 * kicks, snares, hats, claps and toms deterministically and hand them to kits as samples.
 */
export type DrumKind = 'kick' | 'snare' | 'hat' | 'clap' | 'tom' | 'perc'

export type DrumParams = {
  /** starting pitch in Hz (kick/tom/perc body) */
  pitch: number
  /** pitch sweep amount: end pitch = pitch / (1 + sweep*8) ... 0 = none */
  sweep: number
  /** body decay seconds */
  decay: number
  /** noise layer level 0..1 */
  noise: number
  /** noise decay seconds */
  noiseDecay: number
  /** transient click / snap 0..1 */
  click: number
  /** low-pass cutoff on the noise (Hz) */
  tone: number
  /** soft saturation 0..1 */
  drive: number
  /** hats: metallic density 0..1; clap: spread of the flam */
  character: number
}

export const DRUM_DEFAULTS: Record<DrumKind, DrumParams> = {
  kick: {
    pitch: 55,
    sweep: 0.6,
    decay: 0.45,
    noise: 0.05,
    noiseDecay: 0.03,
    click: 0.5,
    tone: 6000,
    drive: 0.35,
    character: 0.5,
  },
  snare: {
    pitch: 190,
    sweep: 0.2,
    decay: 0.18,
    noise: 0.8,
    noiseDecay: 0.22,
    click: 0.4,
    tone: 7000,
    drive: 0.2,
    character: 0.5,
  },
  hat: {
    pitch: 400,
    sweep: 0,
    decay: 0.05,
    noise: 0.9,
    noiseDecay: 0.09,
    click: 0.2,
    tone: 9000,
    drive: 0.1,
    character: 0.7,
  },
  clap: {
    pitch: 1200,
    sweep: 0,
    decay: 0.02,
    noise: 1,
    noiseDecay: 0.25,
    click: 0.3,
    tone: 3000,
    drive: 0.15,
    character: 0.5,
  },
  tom: {
    pitch: 120,
    sweep: 0.3,
    decay: 0.4,
    noise: 0.1,
    noiseDecay: 0.05,
    click: 0.3,
    tone: 4000,
    drive: 0.2,
    character: 0.5,
  },
  perc: {
    pitch: 800,
    sweep: 0.5,
    decay: 0.12,
    noise: 0.2,
    noiseDecay: 0.05,
    click: 0.6,
    tone: 8000,
    drive: 0.3,
    character: 0.5,
  },
}

export const DRUM_LABELS: Record<DrumKind, string> = {
  kick: 'Kick',
  snare: 'Snare',
  hat: 'Hi-hat',
  clap: 'Clap',
  tom: 'Tom',
  perc: 'Perc',
}

function noiseSource(seed = 1234) {
  let state = seed
  return () => {
    state = (state * 16807) % 2147483647
    return (state / 2147483647) * 2 - 1
  }
}

/** One-pole low-pass. */
function lowpass(cutoff: number, sampleRate: number) {
  const alpha = Math.min(1, (2 * Math.PI * cutoff) / sampleRate)
  let y = 0
  return (x: number) => (y += alpha * (x - y))
}
function highpass(cutoff: number, sampleRate: number) {
  const low = lowpass(cutoff, sampleRate)
  return (x: number) => x - low(x)
}

export function renderDrum(kind: DrumKind, params: DrumParams, sampleRate = 44100): Float32Array {
  const length = Math.max(0.08, params.decay * 2.5, params.noiseDecay * 2.5) + 0.05
  const frames = Math.ceil(length * sampleRate)
  const out = new Float32Array(frames)
  const noise = noiseSource(kind === 'hat' ? 99 : 1234)
  const noiseFilter = lowpass(params.tone, sampleRate)
  const noiseHp = highpass(kind === 'hat' ? 4000 : kind === 'clap' ? 800 : 200, sampleRate)
  const endPitch = params.pitch / (1 + params.sweep * 8)
  let phase = 0
  // metallic partials for hats: 6 square waves at inharmonic ratios
  const ratios = [1, 1.342, 1.2312, 1.6532, 1.9523, 2.1523]
  const metalPhases = new Float32Array(6)
  // clap flam offsets
  const flams = [0, 0.012, 0.024].map(offset => offset * (0.5 + params.character))
  for (let index = 0; index < frames; index++) {
    const t = index / sampleRate
    const bodyEnv = Math.exp(-t / Math.max(0.005, params.decay))
    const noiseEnv = Math.exp(-t / Math.max(0.005, params.noiseDecay))
    let sample = 0
    if (kind !== 'hat' && kind !== 'clap') {
      // body: exponential pitch sweep
      const sweepEnv = Math.exp(-t / Math.max(0.01, params.decay * 0.25))
      const hz = endPitch + (params.pitch - endPitch) * sweepEnv
      phase += (2 * Math.PI * hz) / sampleRate
      sample += Math.sin(phase) * bodyEnv * (kind === 'perc' ? 0.6 : 0.9)
    }
    if (kind === 'hat') {
      let metal = 0
      for (let p = 0; p < 6; p++) {
        metalPhases[p] += (2 * Math.PI * params.pitch * ratios[p] * (1 + params.character * 2)) / sampleRate
        metal += Math.sign(Math.sin(metalPhases[p]))
      }
      sample += noiseHp(metal / 6) * noiseEnv * 0.6 * params.character
    }
    if (kind === 'clap') {
      let burst = 0
      for (const offset of flams) {
        const local = t - offset
        if (local >= 0) burst += Math.exp(-local / 0.008) * 0.5
      }
      const tail =
        t > flams[flams.length - 1] ? Math.exp(-(t - flams[flams.length - 1]) / Math.max(0.01, params.noiseDecay)) : 0
      sample += noiseFilter(noiseHp(noise())) * (burst + tail) * params.noise
    } else if (params.noise > 0) {
      sample += noiseFilter(noiseHp(noise())) * noiseEnv * params.noise * (kind === 'hat' ? 1 : 0.7)
    }
    if (params.click > 0 && t < 0.004) sample += (1 - t / 0.004) * params.click * (index % 2 ? 1 : -1) * 0.5
    if (params.drive > 0) {
      const k = 1 + params.drive * 6
      sample = Math.tanh(sample * k) / Math.tanh(k)
    }
    out[index] = sample
  }
  // normalize to -1 dBFS and fade the tail
  let peak = 0
  for (let index = 0; index < frames; index++) peak = Math.max(peak, Math.abs(out[index]))
  const gain = peak > 0 ? 0.89 / peak : 1
  const fade = Math.min(frames, Math.round(sampleRate * 0.01))
  for (let index = 0; index < frames; index++) {
    const tail = index > frames - fade ? (frames - index) / fade : 1
    out[index] *= gain * tail
  }
  return out
}
