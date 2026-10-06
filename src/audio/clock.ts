/**
 * Audio-thread ticker. An AudioWorklet posts a message every `intervalMs` of rendered audio, so
 * scheduling keeps running when the tab is hidden and main-thread timers are throttled.
 * Falls back to setInterval when worklets are unavailable (older browsers, some test contexts).
 */
const processorSource = `
class LaTickProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.frames = 0
    this.interval = sampleRate * 0.025
    this.port.onmessage = event => { if (event.data && event.data.interval) this.interval = sampleRate * event.data.interval }
  }
  process() {
    this.frames += 128
    if (this.frames >= this.interval) { this.frames -= this.interval; this.port.postMessage(0) }
    return true
  }
}
registerProcessor('la-tick', LaTickProcessor)
`

const loaded = new WeakSet<BaseAudioContext>()

export class Ticker {
  private node?: AudioWorkletNode
  private silence?: GainNode
  private timer?: ReturnType<typeof setInterval>
  private handler: (() => void) | null = null
  readonly kind: 'worklet' | 'interval'
  private constructor(kind: 'worklet' | 'interval', node?: AudioWorkletNode, silence?: GainNode) {
    this.kind = kind
    this.node = node
    this.silence = silence
    if (node) node.port.onmessage = () => this.handler?.()
  }
  static async create(context: AudioContext, intervalMs = 25): Promise<Ticker> {
    try {
      if (!context.audioWorklet) throw new Error('no worklet')
      if (!loaded.has(context)) {
        const url = URL.createObjectURL(new Blob([processorSource], { type: 'application/javascript' }))
        try {
          await context.audioWorklet.addModule(url)
        } finally {
          URL.revokeObjectURL(url)
        }
        loaded.add(context)
      }
      const node = new AudioWorkletNode(context, 'la-tick', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      })
      node.port.postMessage({ interval: intervalMs / 1000 })
      const silence = context.createGain()
      silence.gain.value = 0
      node.connect(silence).connect(context.destination)
      return new Ticker('worklet', node, silence)
    } catch (error) {
      console.warn('AudioWorklet clock unavailable, using an interval timer:', error)
      return new Ticker('interval')
    }
  }
  start(handler: () => void, intervalMs = 25) {
    this.stop()
    this.handler = handler
    if (this.kind === 'interval') this.timer = setInterval(handler, intervalMs)
  }
  stop() {
    this.handler = null
    clearInterval(this.timer)
    this.timer = undefined
  }
  dispose() {
    this.stop()
    this.node?.disconnect()
    this.silence?.disconnect()
  }
}
