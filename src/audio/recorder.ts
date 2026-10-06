import { encodeWav } from './wav'

const processorSource = `
class LaRecordProcessor extends AudioWorkletProcessor {
  constructor() { super(); this.batch = []; this.count = 0; this.startTime = -1 }
  process(inputs) {
    const input = inputs[0]
    if (!input || !input.length) return true
    if (this.startTime < 0) this.startTime = currentTime
    this.batch.push(input.map(channel => channel.slice()))
    if (++this.count >= 16) {
      const channels = this.batch[0].length
      const frames = this.batch.reduce((sum, block) => sum + block[0].length, 0)
      const merged = Array.from({ length: channels }, () => new Float32Array(frames))
      let offset = 0
      for (const block of this.batch) { for (let c = 0; c < channels; c++) merged[c].set(block[c], offset); offset += block[0].length }
      this.port.postMessage({ time: this.startTime, channels: merged }, merged.map(m => m.buffer))
      this.batch = []; this.count = 0; this.startTime = -1
    }
    return true
  }
}
registerProcessor('la-record', LaRecordProcessor)
`
const loaded = new WeakSet<BaseAudioContext>()

export type Recording = { buffer: AudioBuffer; blob: Blob; startTime: number }

/**
 * Captures microphone / line input through an AudioWorklet so every block carries its audio-clock
 * timestamp. `finish(from)` trims everything before `from`, which lets a count-in run while the
 * input is already open and still produce a clip that begins exactly on the downbeat.
 */
export class InputRecorder {
  private context: AudioContext
  private stream?: MediaStream
  private source?: MediaStreamAudioSourceNode
  private node?: AudioWorkletNode
  private monitor: GainNode
  private chunks: { time: number; channels: Float32Array[] }[] = []
  private firstTime = -1
  recording = false
  constructor(context: AudioContext) {
    this.context = context
    this.monitor = context.createGain()
    this.monitor.gain.value = 0
  }
  get active() {
    return Boolean(this.stream)
  }
  async open(monitorTo?: AudioNode, deviceId?: string) {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser does not allow microphone capture.')
    if (!this.context.audioWorklet) throw new Error('AudioWorklet is required for recording in this browser.')
    if (!loaded.has(this.context)) {
      const url = URL.createObjectURL(new Blob([processorSource], { type: 'application/javascript' }))
      try {
        await this.context.audioWorklet.addModule(url)
      } finally {
        URL.revokeObjectURL(url)
      }
      loaded.add(this.context)
    }
    this.close()
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: { ideal: 2 },
      },
    })
    this.source = this.context.createMediaStreamSource(this.stream)
    this.node = new AudioWorkletNode(this.context, 'la-record', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    })
    this.node.port.onmessage = event => {
      if (!this.recording) return
      const chunk = event.data as { time: number; channels: Float32Array[] }
      if (this.firstTime < 0) this.firstTime = chunk.time
      this.chunks.push(chunk)
    }
    const silent = this.context.createGain()
    silent.gain.value = 0
    this.source.connect(this.node).connect(silent).connect(this.context.destination)
    this.source.connect(this.monitor)
    if (monitorTo) this.monitor.connect(monitorTo)
  }
  setMonitor(enabled: boolean) {
    this.monitor.gain.setTargetAtTime(enabled ? 1 : 0, this.context.currentTime, 0.01)
  }
  start() {
    this.chunks = []
    this.firstTime = -1
    this.recording = true
  }
  /** Stops capture and returns the audio from `from` (audio-clock seconds) to now. */
  finish(from: number): Recording | null {
    this.recording = false
    const chunks = this.chunks
    this.chunks = []
    if (!chunks.length) return null
    const channels = chunks[0].channels.length
    const rate = this.context.sampleRate
    const skipFrames = Math.max(0, Math.round((from - chunks[0].time) * rate))
    const total = chunks.reduce((sum, chunk) => sum + chunk.channels[0].length, 0) - skipFrames
    if (total <= 0) return null
    const buffer = this.context.createBuffer(channels, total, rate)
    let offset = 0
    let skipped = 0
    for (const chunk of chunks) {
      const length = chunk.channels[0].length
      let begin = 0
      if (skipped < skipFrames) {
        begin = Math.min(length, skipFrames - skipped)
        skipped += begin
        if (begin >= length) continue
      }
      for (let channel = 0; channel < channels; channel++)
        buffer.getChannelData(channel).set(chunk.channels[channel].subarray(begin), offset)
      offset += length - begin
    }
    return { buffer, blob: encodeWav(buffer), startTime: Math.max(from, chunks[0].time) }
  }
  close() {
    this.recording = false
    this.node?.disconnect()
    this.source?.disconnect()
    this.monitor.disconnect()
    this.stream?.getTracks().forEach(track => track.stop())
    this.stream = undefined
    this.source = undefined
    this.node = undefined
  }
  static async devices() {
    if (!navigator.mediaDevices?.enumerateDevices) return []
    return (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'audioinput')
  }
}
